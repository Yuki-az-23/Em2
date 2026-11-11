#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR/..
# shellcheck disable=SC2015,SC2016,SC2329 # test idioms: A && ok || no, literal $ strings, shadowing awk
# Tests for env_upsert, env_get and env_apply_template in ../lib.sh.
# Run: bash exhibit/deploy/test/test-env-upsert.sh   (no root, no network)
set -Eeuo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$HERE/../lib.sh"

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
fails=0
ok() { printf 'ok   %s\n' "$1"; }
no() { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }
expect_file() { # NAME FILE EXPECTED
  if [[ "$(cat "$2")" == "$3" ]]; then ok "$1"; else no "$1"; diff <(printf '%s\n' "$3") "$2" || true; fi
}

f=$T/a.env
printf 'A=1\n# comment B=0\nB=old\nC=3\n' >"$f"
chmod 640 "$f"
ino=$(stat -c %i "$f")
env_upsert "$f" B new
expect_file "replaces an existing key in place" "$f" $'A=1\n# comment B=0\nB=new\nC=3'
env_upsert "$f" D 4
expect_file "appends a missing key" "$f" $'A=1\n# comment B=0\nB=new\nC=3\nD=4'
[[ "$(stat -c '%i %a' "$f")" == "$ino 640" ]] && ok "keeps inode and mode" || no "keeps inode and mode"

printf 'K=1\nK=2\nKEY=x\n' >"$f"
env_upsert "$f" K 9
expect_file "drops duplicate keys, leaves prefix-sharing keys" "$f" $'K=9\nKEY=x'

printf 'export E=1\n' >"$f"
env_upsert "$f" E 2
expect_file "handles export prefix" "$f" "E=2"

# Values with characters that break sed, awk -v escapes and the shell.
printf 'X=0\n' >"$f"
v='a|b/c&d\\n$(id)`id`"q'"'"'s \1 %s *[x]'
env_upsert "$f" X "$v"
[[ "$(env_get "$f" X)" == "$v" ]] && ok "special characters survive literally" || no "special characters survive literally"
grep -qxF "X=$v" "$f" && ok "line written verbatim" || no "line written verbatim"

# Value passes through the environment, not argv: a child running during the
# call would not see it in ps. Checked indirectly: awk argv has no value.
printf 'S=0\n' >"$f"
secret='s3cr3t-value-that-must-not-be-in-argv'
( awk() { for a in "$@"; do [[ "$a" == *"$secret"* ]] && exit 7; done; command awk "$@"; }
  env_upsert "$f" S "$secret" ) && ok "value not in awk argv" || no "value not in awk argv"

if env_upsert "$f" 'BAD KEY' 1 2>/dev/null; then no "rejects bad key"; else ok "rejects bad key"; fi
if env_upsert "$f" N $'a\nb' 2>/dev/null; then no "rejects newline value"; else ok "rejects newline value"; fi

rm -f "$f"
(umask 077; env_upsert "$f" NEW 1)
[[ "$(stat -c %a "$f")" == 600 && "$(cat "$f")" == "NEW=1" ]] && ok "creates missing file with umask" || no "creates missing file with umask"

printf 'Q="quoted value"\nR='"'"'single'"'"'\n' >"$f"
[[ "$(env_get "$f" Q)" == "quoted value" && "$(env_get "$f" R)" == "single" ]] && ok "env_get strips quotes" || no "env_get strips quotes"
if env_get "$f" MISSING >/dev/null; then no "env_get missing key fails"; else ok "env_get missing key fails"; fi

# Template with @DOMAIN@.
tpl=$T/tpl
printf '# c\n\nSITE_URL=https://exhibit-test.@DOMAIN@\nAPI_GW_HTTP_PORT=127.0.0.1:8000\n' >"$tpl"
printf 'SITE_URL=http://localhost:3000\nAPI_GW_HTTP_PORT=8000\nOTHER=1\n' >"$f"
keys=$(env_apply_template "$tpl" "$f" example.org)
expect_file "template applied" "$f" $'SITE_URL=https://exhibit-test.example.org\nAPI_GW_HTTP_PORT=127.0.0.1:8000\nOTHER=1'
[[ "$keys" == $'SITE_URL\nAPI_GW_HTTP_PORT' ]] && ok "template prints keys only" || no "template prints keys only"

# The real template: every line is KEY=VALUE, no secrets-looking keys.
real=$HERE/../supabase/env.exhibit-test
printf 'COMPOSE_FILE=docker-compose.yml\n' >"$f"
env_apply_template "$real" "$f" example.org >/dev/null
[[ "$(env_get "$f" API_EXTERNAL_URL)" == "https://api-test.example.org/auth/v1" ]] && ok "real template: API_EXTERNAL_URL" || no "real template: API_EXTERNAL_URL"
[[ "$(env_get "$f" COMPOSE_FILE)" == "docker-compose.yml:docker-compose.exhibit.yml" ]] && ok "real template: COMPOSE_FILE" || no "real template: COMPOSE_FILE"
if grep -Ev '^\s*(#|$)' "$real" | grep -E '^[A-Z_]*(PASSWORD|SECRET|TOKEN|_KEY)=' >/dev/null; then no "real template has no secret keys"; else ok "real template has no secret keys"; fi
if grep -q '@DOMAIN@' "$f"; then no "no placeholder left"; else ok "no placeholder left"; fi

# load_config / validate_config
cfg=$T/config
printf 'BOT_USERNAME=TestExhibitBot\nEM2_REF=%s\nSSH_ALLOW_CIDR=192.168.1.0/24\n' "$(printf 'a%.0s' {1..40})" >"$cfg"
load_config "$cfg"
[[ "$DOMAIN" == solorpunk.com && "$SEED_DEMO" == 0 ]] && ok "config defaults" || no "config defaults"
validate_config >/dev/null && ok "valid config passes" || no "valid config passes"
printf 'DOMAIN=x.org\nEVIL=$(touch %s/pwned)\n' "$T" >"$cfg"
if load_config "$cfg" 2>/dev/null; then no "unknown key rejected"; else ok "unknown key rejected"; fi
[[ ! -e "$T/pwned" ]] && ok "config is never executed" || no "config is never executed"
printf 'DOMAIN=x.org\nCF_TUNEL_TOKEN=sEcReTvAlUe0123456789abcdefghijklmn\n' >"$cfg"
err=$(load_config "$cfg" 2>&1) && no "misspelled key rejected" || ok "misspelled key rejected"
if [[ "$err" == *sEcReTvAlUe* ]]; then no "config error never prints the value"; else ok "config error never prints the value"; fi
[[ "$err" == *"line 2"*CF_TUNEL_TOKEN* ]] && ok "config error names the line and key" || no "config error names the line and key"
printf 'sEcReTvAlUe0123456789abcdefghijklmn\n' >"$cfg"
err=$(load_config "$cfg" 2>&1) || true
if [[ "$err" == *sEcReTvAlUe* ]]; then no "bare line never printed"; else ok "bare line never printed"; fi
for bot in YourExhibitTestBot ""; do
  printf 'BOT_USERNAME=%s\nSSH_ALLOW_CIDR=192.168.1.0/24\n' "$bot" >"$cfg"
  load_config "$cfg"
  validate_config >/dev/null && no "BOT_USERNAME '$bot' rejected" || ok "BOT_USERNAME '$bot' rejected"
done
load_config "$HERE/../config.example"
validate_config >/dev/null && no "config.example as shipped is rejected" || ok "config.example as shipped is rejected"
printf 'DOMAIN=Bad_Domain\nBOT_USERNAME=ab\nEM2_REF=main\nSSH_ALLOW_CIDR=\n' >"$cfg"
load_config "$cfg"
n=$(validate_config | wc -l) || true
[[ "$n" == 4 ]] && ok "invalid config reports each problem" || no "invalid config reports each problem ($n)"

# generate_supabase_keys: every upstream key replaced, valid JWTs, no output
gk=$T/sb.env
printf 'JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long\nANON_KEY=old\nPOSTGRES_PASSWORD=old\nKEEP=1\n' >"$gk"
out=$(generate_supabase_keys "$gk" 2>&1) && ok "generate_supabase_keys runs" || no "generate_supabase_keys runs"
[[ -z "$out" ]] && ok "generate_supabase_keys prints nothing" || no "generate_supabase_keys prints nothing"
miss=0
for k in JWT_SECRET ANON_KEY SERVICE_ROLE_KEY SECRET_KEY_BASE REALTIME_DB_ENC_KEY VAULT_ENC_KEY PG_META_CRYPTO_KEY \
  LOGFLARE_PUBLIC_ACCESS_TOKEN LOGFLARE_PRIVATE_ACCESS_TOKEN S3_PROTOCOL_ACCESS_KEY_ID S3_PROTOCOL_ACCESS_KEY_SECRET \
  MINIO_ROOT_PASSWORD POSTGRES_PASSWORD DASHBOARD_PASSWORD; do
  v=$(env_get "$gk" "$k") || { miss=1; continue; }
  [[ -n "$v" && "$v" != old && "$v" != your-super-secret* ]] || miss=1
done
((miss == 0)) && ok "every key generated" || no "every key generated"
[[ "$(env_get "$gk" KEEP)" == 1 && "$(grep -c '^ANON_KEY=' "$gk")" == 1 ]] && ok "other lines kept, no duplicates" || no "other lines kept, no duplicates"
if GK_JWT=$(env_get "$gk" JWT_SECRET) GK_ANON=$(env_get "$gk" ANON_KEY) GK_SR=$(env_get "$gk" SERVICE_ROLE_KEY) python3 -I -c '
import base64, hashlib, hmac, json, os
def d(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
for var, role in (("GK_ANON", "anon"), ("GK_SR", "service_role")):
    h, b, s = os.environ[var].split(".")
    assert hmac.compare_digest(d(s), hmac.new(os.environ["GK_JWT"].encode(), (h + "." + b).encode(), hashlib.sha256).digest())
    p = json.loads(d(b)); assert p["role"] == role and p["iss"] == "supabase" and p["exp"] > p["iat"]
    assert json.loads(d(h)) == {"alg": "HS256", "typ": "JWT"}
'; then ok "API keys are HS256 JWTs signed with JWT_SECRET"; else no "API keys are HS256 JWTs signed with JWT_SECRET"; fi

# container_state: one clean word, "absent" when docker has no such container
docker() { if [[ "$4" == present ]]; then printf 'healthy\n'; else echo 'Error: No such object' >&2; return 1; fi; }
[[ "$(container_state present)" == healthy ]] && ok "container_state healthy" || no "container_state healthy"
[[ "$(container_state missing)" == absent ]] && ok "container_state absent" || no "container_state absent"
docker() { printf '\n'; }
[[ "$(container_state blank)" == absent ]] && ok "container_state blank output" || no "container_state blank output"
unset -f docker

# ip_in_cidr / is_loopback_addr / version_ge
ip_in_cidr 192.168.1.20 192.168.1.0/24 && ok "ip in cidr" || no "ip in cidr"
ip_in_cidr ::ffff:192.168.1.20 192.168.1.0/24 && ok "mapped ip in cidr" || no "mapped ip in cidr"
ip_in_cidr 10.0.0.1 192.168.1.0/24 && no "ip outside cidr" || ok "ip outside cidr"
is_loopback_addr '127.0.0.53%lo' && is_loopback_addr '[::1]' && ! is_loopback_addr '0.0.0.0' && ! is_loopback_addr '[::]' &&
  ok "loopback detection" || no "loopback detection"
version_ge 2.29.1 2.24.0 && version_ge v5.6.0 2.24.0 && ! version_ge 2.20.3 2.24.0 && ok "version_ge" || no "version_ge"

echo "env/config tests: $fails failure(s)"
exit $((fails > 0))
