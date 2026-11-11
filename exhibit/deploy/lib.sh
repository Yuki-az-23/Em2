# shellcheck shell=bash
# Shared helpers for the exhibit test deployment on the VM.
# Sourced by bootstrap-vm.sh, healthcheck.sh and the tests in test/.
#
# Rules every helper keeps:
# - No secret value is ever printed, put in argv, or passed through sed.
# - Report lines are "CHECK <name> <STATUS> <detail>"; STATUS is one of
#   PASS, FAIL, WARN, SKIP, INFO. Only FAIL changes the result.

# Paths. Tests override these before sourcing or before calling a helper.
: "${EXHIBIT_CONFIG:=/etc/exhibit-test/config}"
: "${EXHIBIT_BASE:=/opt/exhibit-test}"
: "${EXHIBIT_SECRETS:=/root/exhibit-test}"
: "${EXHIBIT_LOGDIR:=/var/log/exhibit-test}"
: "${EXHIBIT_STATEDIR:=/var/lib/exhibit-test}"
: "${EXHIBIT_SBIN:=/usr/local/sbin}"
: "${EXHIBIT_UNITDIR:=/etc/systemd/system}"

# Keys whose values the leak scan treats as secret. Matched against the key
# name (after an optional "export "), case-sensitive, extended regex.
: "${LEAK_KEY_RE:=(PASSWORD|SECRET|KEY|TOKEN|JWKS)}"
# Shortest value the leak scan looks for. Shorter values give false hits.
: "${LEAK_MIN_LEN:=16}"

# Files the leak scan reads secret values from. Override as an array.
if ! declare -p LEAK_SOURCES >/dev/null 2>&1; then
  LEAK_SOURCES=(
    "$EXHIBIT_BASE/supabase/.env"
    "$EXHIBIT_BASE/edge/.env"
    "$EXHIBIT_SECRETS/secrets.txt"
    "$EXHIBIT_SECRETS/cloudflare-handoff.env"
    "$EXHIBIT_SECRETS/env.backup"
    "$EXHIBIT_CONFIG"
  )
fi

# ---------------------------------------------------------------------------
# Report lines
# ---------------------------------------------------------------------------

# check NAME STATUS [DETAIL...]
# Prints the line and, when REPORT is set, appends it to $REPORT.
check() {
  local name=$1 status=$2
  shift 2
  local line="CHECK ${name} ${status}"
  if (($#)); then line+=" $*"; fi
  printf '%s\n' "$line"
  if [[ -n "${REPORT:-}" ]]; then
    printf '%s\n' "$line" >>"$REPORT"
  fi
}

# report_note TEXT... : a free-text line in the report (no CHECK prefix).
report_note() {
  printf '%s\n' "$*"
  if [[ -n "${REPORT:-}" ]]; then
    printf '%s\n' "$*" >>"$REPORT"
  fi
}

# report_has_fail FILE : true when FILE has at least one FAIL check line.
report_has_fail() {
  [[ -f "$1" ]] && grep -Eq '^CHECK [^ ]+ FAIL( |$)' "$1"
}

say() { printf '==> %s\n' "$*"; }

# ---------------------------------------------------------------------------
# Env files (KEY=VALUE, one per line)
# ---------------------------------------------------------------------------

# awk function shared by env_get and leak_values: strips one pair of
# surrounding double or single quotes. Works in mawk and gawk.
# shellcheck disable=SC2016
AWK_UNQUOTE='
function unquote(v,   f, l) {
  if (length(v) < 2) return v
  f = substr(v, 1, 1); l = substr(v, length(v), 1)
  if ((f == "\"" || f == sprintf("%c", 39)) && f == l) return substr(v, 2, length(v) - 2)
  return v
}
'

valid_key() { [[ "$1" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; }

# env_get FILE KEY : prints the value of the last KEY= line, without
# surrounding quotes. Returns 1 when the key is absent.
env_get() {
  local file=$1 key=$2
  valid_key "$key" || return 2
  [[ -r "$file" ]] || return 1
  EU_KEY=$key awk "$AWK_UNQUOTE"'
    BEGIN { k = ENVIRON["EU_KEY"]; found = 0 }
    {
      line = $0
      sub(/\r$/, "", line)
      sub(/^export[ \t]+/, "", line)
      if (index(line, k "=") == 1) { v = substr(line, length(k) + 2); found = 1 }
    }
    END {
      if (!found) exit 1
      print unquote(v)
    }' "$file"
}

# env_upsert FILE KEY VALUE
# Replaces the first KEY= line (dropping later duplicates) or appends one.
# The value reaches awk through the environment, so it never appears in argv
# and is never interpreted as a sed or awk pattern. The file keeps its inode
# and mode; a new file is created with the caller's umask.
env_upsert() {
  local file=$1 key=$2 value=$3 tmp
  valid_key "$key" || { echo "env_upsert: bad key name" >&2; return 2; }
  case "$value" in
    *$'\n'* | *$'\r'*) echo "env_upsert: value for $key has a newline" >&2; return 2 ;;
  esac
  [[ -e "$file" ]] || : >"$file"
  tmp=$(mktemp "${file}.upsert.XXXXXX") || return 1
  if ! EU_KEY=$key EU_VAL=$value awk '
    BEGIN { k = ENVIRON["EU_KEY"]; v = ENVIRON["EU_VAL"]; done = 0 }
    {
      line = $0
      sub(/^export[ \t]+/, "", line)
      if (index(line, k "=") == 1) {
        if (!done) { print k "=" v; done = 1 }
        next
      }
      print
    }
    END { if (!done) print k "=" v }' "$file" >"$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

# env_apply_template TEMPLATE ENVFILE DOMAIN
# Upserts every KEY=VALUE line of TEMPLATE into ENVFILE, with @DOMAIN@
# replaced. Comments and blank lines are skipped. Prints the keys it set.
env_apply_template() {
  local template=$1 envfile=$2 domain=$3 line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    [[ -z "${line//[[:space:]]/}" || "$line" =~ ^[[:space:]]*# ]] && continue
    key=${line%%=*}
    value=${line#*=}
    valid_key "$key" || { echo "env_apply_template: bad line in $template" >&2; return 2; }
    value=${value//@DOMAIN@/$domain}
    env_upsert "$envfile" "$key" "$value" || return 1
    printf '%s\n' "$key"
  done <"$template"
}

# jwt_hs256 ROLE : prints a Supabase API key (HS256 JWT, iss "supabase",
# five years) for ROLE, signed with $GK_JWT_SECRET. The secret reaches
# python through the environment, never argv.
jwt_hs256() {
  GK_ROLE=$1 python3 -I -c '
import base64, hashlib, hmac, json, os, time
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
iat = int(time.time())
head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
body = b64(json.dumps({"role": os.environ["GK_ROLE"], "iss": "supabase", "iat": iat,
                       "exp": iat + 5 * 365 * 24 * 3600}, separators=(",", ":")).encode())
msg = (head + "." + body).encode()
sig = hmac.new(os.environ["GK_JWT_SECRET"].encode(), msg, hashlib.sha256).digest()
print(head + "." + body + "." + b64(sig))
'
}

# generate_supabase_keys ENVFILE : the same set of values upstream's
# utils/generate-keys.sh makes, generated here and written with env_upsert.
# Upstream prints them and passes them to sed on argv; this never does.
generate_supabase_keys() {
  local envf=$1 jwt k v name kind n
  rand_hex() { openssl rand -hex "$1"; }
  rand_b64() { openssl rand -base64 "$1" | tr -d '\n'; }
  jwt=$(rand_b64 30) || return 1
  [[ ${#jwt} -ge 32 ]] || return 1
  env_upsert "$envf" JWT_SECRET "$jwt" || return 1
  v=$(GK_JWT_SECRET=$jwt jwt_hs256 anon) || return 1
  env_upsert "$envf" ANON_KEY "$v" || return 1
  v=$(GK_JWT_SECRET=$jwt jwt_hs256 service_role) || return 1
  env_upsert "$envf" SERVICE_ROLE_KEY "$v" || return 1
  for k in SECRET_KEY_BASE:b64:48 REALTIME_DB_ENC_KEY:hex:8 VAULT_ENC_KEY:hex:16 \
    PG_META_CRYPTO_KEY:b64:24 LOGFLARE_PUBLIC_ACCESS_TOKEN:b64:24 \
    LOGFLARE_PRIVATE_ACCESS_TOKEN:b64:24 S3_PROTOCOL_ACCESS_KEY_ID:hex:16 \
    S3_PROTOCOL_ACCESS_KEY_SECRET:hex:32 MINIO_ROOT_PASSWORD:hex:16 \
    POSTGRES_PASSWORD:hex:16 DASHBOARD_PASSWORD:hex:16; do
    IFS=: read -r name kind n <<<"$k"
    if [[ $kind == hex ]]; then v=$(rand_hex "$n"); else v=$(rand_b64 "$n"); fi || return 1
    [[ -n "$v" ]] || return 1
    env_upsert "$envf" "$name" "$v" || return 1
  done
}

# ---------------------------------------------------------------------------
# Config: /etc/exhibit-test/config
# ---------------------------------------------------------------------------

# load_config [FILE] : parses KEY=VALUE lines for the known keys only (never
# sources the file) and sets them as shell variables. Unknown keys are an
# error. DOMAIN defaults to solorpunk.com and EM2_REPO to the public repo.
CONFIG_KEYS=(DOMAIN BOT_USERNAME EM2_REF EM2_REPO SEED_DEMO SSH_ALLOW_CIDR CF_TUNNEL_TOKEN)
load_config() {
  local file=${1:-$EXHIBIT_CONFIG} line key value k ok lineno=0
  [[ -r "$file" ]] || { echo "config not readable: $file" >&2; return 1; }
  for k in "${CONFIG_KEYS[@]}"; do printf -v "$k" '%s' ""; done
  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))
    line=${line%$'\r'}
    [[ -z "${line//[[:space:]]/}" || "$line" =~ ^[[:space:]]*# ]] && continue
    line=${line#export }
    key=${line%%=*}
    value=${line#*=}
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value=${BASH_REMATCH[1]}; fi
    ok=0
    for k in "${CONFIG_KEYS[@]}"; do [[ "$key" == "$k" ]] && ok=1; done
    if ((ok == 0)); then
      # Never echo the raw line: a mistyped key may sit next to a secret.
      if [[ "$line" == *=* && "$key" =~ ^[A-Z_][A-Z0-9_]{0,39}$ ]]; then
        echo "config line $lineno: unknown key '$key'" >&2
      else
        echo "config line $lineno: not a KEY=VALUE line" >&2
      fi
      return 1
    fi
    printf -v "$key" '%s' "$value"
  done <"$file"
  : "${DOMAIN:=solorpunk.com}"
  : "${EM2_REPO:=https://github.com/Yuki-az-23/Em2}"
  : "${SEED_DEMO:=0}"
}

# validate_config : prints one reason per problem; returns 1 if any.
validate_config() {
  local bad=0
  [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] ||
    { echo "DOMAIN is not a lowercase domain name"; bad=1; }
  if [[ -z "$BOT_USERNAME" ]]; then
    echo "BOT_USERNAME is empty: set the test bot's username from @BotFather"; bad=1
  elif [[ "${BOT_USERNAME,,}" == yourexhibittestbot ]]; then
    echo "BOT_USERNAME is still the example placeholder"; bad=1
  elif ! [[ "$BOT_USERNAME" =~ ^[A-Za-z0-9_]{5,32}$ ]]; then
    echo "BOT_USERNAME must match ^[A-Za-z0-9_]{5,32}$"; bad=1
  fi
  [[ -z "$EM2_REF" || "$EM2_REF" =~ ^[0-9a-f]{40}$ ]] ||
    { echo "EM2_REF must be a 40-hex commit SHA (or empty to use this checkout)"; bad=1; }
  [[ "$EM2_REPO" =~ ^https://[A-Za-z0-9./_-]+$ ]] ||
    { echo "EM2_REPO must be an https URL"; bad=1; }
  [[ "$SEED_DEMO" == 0 || "$SEED_DEMO" == 1 ]] ||
    { echo "SEED_DEMO must be 0 or 1"; bad=1; }
  [[ "$SSH_ALLOW_CIDR" =~ ^[0-9a-fA-F:.]+/[0-9]{1,3}$ ]] ||
    { echo "SSH_ALLOW_CIDR must be a CIDR such as 192.168.1.0/24"; bad=1; }
  [[ -z "$CF_TUNNEL_TOKEN" || "$CF_TUNNEL_TOKEN" =~ ^[A-Za-z0-9+/=_-]{32,}$ ]] ||
    { echo "CF_TUNNEL_TOKEN does not look like a tunnel token"; bad=1; }
  return "$bad"
}

# ---------------------------------------------------------------------------
# Leak scan
# ---------------------------------------------------------------------------

# leak_values OUTFILE : writes every secret value of LEAK_MIN_LEN or more
# characters from LEAK_SOURCES to OUTFILE, one per line, deduplicated.
leak_values() {
  local out=$1 src
  : >"$out"
  for src in "${LEAK_SOURCES[@]}"; do
    [[ -r "$src" ]] || continue
    LK_RE=$LEAK_KEY_RE LK_MIN=$LEAK_MIN_LEN awk "$AWK_UNQUOTE"'
      BEGIN { re = ENVIRON["LK_RE"]; min = ENVIRON["LK_MIN"] + 0 }
      /^[ \t]*#/ { next }
      {
        line = $0
        sub(/\r$/, "", line)
        sub(/^export[ \t]+/, "", line)
        eq = index(line, "=")
        if (eq < 2) next
        k = substr(line, 1, eq - 1)
        v = substr(line, eq + 1)
        if (k !~ /^[A-Za-z_][A-Za-z0-9_]*$/ || k !~ re) next
        v = unquote(v)
        if (length(v) >= min) print v
      }' "$src" >>"$out"
  done
  sort -u -o "$out" "$out"
}

# leak_scan FILE... : returns 0 when no secret value occurs in any FILE.
# On a hit it prints only "LEAK in <file>" (never the line or the value)
# and returns 1. Missing targets are skipped.
leak_scan() {
  local values target n rc=0
  values=$(mktemp "${TMPDIR:-/tmp}/exhibit-leak.XXXXXX") || return 1
  chmod 600 "$values"
  leak_values "$values"
  if [[ -s "$values" ]]; then
    for target in "$@"; do
      [[ -f "$target" ]] || continue
      n=$(grep -F -c -f "$values" -- "$target" 2>/dev/null) || true
      if [[ "${n:-0}" -gt 0 ]]; then
        printf 'LEAK in %s\n' "$target"
        rc=1
      fi
    done
  fi
  if command -v shred >/dev/null 2>&1; then shred -u "$values" 2>/dev/null || rm -f "$values"; else rm -f "$values"; fi
  return "$rc"
}

# ---------------------------------------------------------------------------
# HTTP with keys kept out of argv
# ---------------------------------------------------------------------------

# curl_auth KEY CURL_ARGS... : runs curl with "apikey: KEY" and
# "Authorization: Bearer KEY" read from a mode-600 config file, so the key
# never appears in argv. Returns curl's exit code.
curl_auth() {
  local key=$1 cfg rc=0
  shift
  cfg=$(mktemp "${TMPDIR:-/tmp}/exhibit-curl.XXXXXX") || return 1
  chmod 600 "$cfg"
  printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' "$key" "$key" >"$cfg"
  curl -K "$cfg" "$@" || rc=$?
  rm -f "$cfg"
  return "$rc"
}

# http_code_auth KEY METHOD URL BODYFILE [CURL_ARGS...] : prints the HTTP
# status ("000" when the request failed); the body goes to BODYFILE.
http_code_auth() {
  local key=$1 method=$2 url=$3 body=$4
  shift 4
  curl_auth "$key" -sS -m 15 -o "$body" -w '%{http_code}' -X "$method" "$@" "$url" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------

# version_ge A B : true when version A >= B (leading "v" ignored).
version_ge() {
  local a=${1#v} b=${2#v}
  [[ "$(printf '%s\n%s\n' "$b" "$a" | sort -V | head -n1)" == "$b" ]]
}

# ip_in_cidr IP CIDR : true when IP lies inside CIDR (IPv4 or IPv6,
# IPv4-mapped IPv6 addresses are unwrapped).
ip_in_cidr() {
  python3 -I -c '
import ipaddress, sys
ip = ipaddress.ip_address(sys.argv[1])
if getattr(ip, "ipv4_mapped", None):
    ip = ip.ipv4_mapped
net = ipaddress.ip_network(sys.argv[2], strict=False)
sys.exit(0 if ip.version == net.version and ip in net else 1)
' "$1" "$2" 2>/dev/null
}

# is_loopback_addr ADDR : ADDR as printed by `ss` (port already removed).
is_loopback_addr() {
  local a=${1#[}
  a=${a%]}
  a=${a%%%*}
  [[ "$a" == 127.* || "$a" == ::1 || "$a" == ::ffff:127.* ]]
}

# container_state NAME : prints the health status, or the run state for a
# container without a health check, or "absent".
container_state() {
  local s
  s=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null) || s=
  s=${s//[[:space:]]/}
  printf '%s\n' "${s:-absent}"
}
