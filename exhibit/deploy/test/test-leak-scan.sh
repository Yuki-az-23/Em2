#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR/..
# shellcheck disable=SC2015,SC2016,SC2329 # test idioms: A && ok || no, literal $ strings, shadowing awk
# Tests for leak_scan in ../lib.sh, and a scan of the deploy scripts for
# commands that would print secrets. Run: bash exhibit/deploy/test/test-leak-scan.sh
set -Eeuo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

# Fake secret files, in the same shapes as on the VM. The values are random
# test strings generated here, not real secrets.
rnd() { head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c "$1"; }
ANON="eyJ$(rnd 30).$(rnd 40).$(rnd 43)"
SERVICE="eyJ$(rnd 30).$(rnd 40).$(rnd 43)"
PGPW=$(rnd 32)
HOOK=$(rnd 64)
TUNNEL="eyJh$(rnd 60)"
SHORT=abc123
mkdir -p "$T/base/supabase" "$T/base/edge" "$T/secrets"
cat >"$T/base/supabase/.env" <<ENV
# Secrets
POSTGRES_PASSWORD=$PGPW
ANON_KEY=$ANON
SERVICE_ROLE_KEY="$SERVICE"
DASHBOARD_PASSWORD=$SHORT
SUPABASE_PUBLIC_URL=https://api-test.example.org
STUDIO_DEFAULT_ORGANIZATION=Default Organization
ENV
printf 'TUNNEL_TOKEN=%s\nCLOUDFLARED_IMAGE=cloudflare/cloudflared:2026.9.0\n' "$TUNNEL" >"$T/base/edge/.env"
printf 'TELEGRAM_WEBHOOK_SECRET=%s\n' "$HOOK" >"$T/secrets/secrets.txt"
printf 'DOMAIN=example.org\nCF_TUNNEL_TOKEN=%s\n' "$TUNNEL" >"$T/config"

export EXHIBIT_BASE=$T/base EXHIBIT_SECRETS=$T/secrets EXHIBIT_CONFIG=$T/config TMPDIR=$T
# shellcheck source=lib.sh
source "$HERE/../lib.sh"

fails=0
ok() { printf 'ok   %s\n' "$1"; }
no() { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }

clean=$T/clean.log
printf 'CHECK net_apt PASS\nCHECK gateway PASS https://api-test.example.org\nimage cloudflare/cloudflared:2026.9.0\nDefault Organization\npw=%s\n' "$SHORT" >"$clean"
out=$(leak_scan "$clean") && ok "clean file passes" || no "clean file passes"
[[ -z "$out" ]] && ok "clean scan prints nothing" || no "clean scan prints nothing"

for name in ANON SERVICE PGPW HOOK TUNNEL; do
  f=$T/leak-$name.log
  printf 'line one\nsomething %s something\nline three\n' "${!name}" >"$f"
  set +e
  out=$(leak_scan "$clean" "$f")
  rc=$?
  set -e
  [[ $rc -ne 0 ]] && ok "detects $name" || no "detects $name"
  [[ "$out" == "LEAK in $f" ]] && ok "prints only the file for $name" || no "prints only the file for $name: $out"
  [[ "$out" != *"${!name}"* && "$out" != *something* ]] && ok "never prints the value for $name" || no "never prints the value for $name"
done

# Partial value (a prefix) is not a leak; quoted value is found unquoted.
f=$T/prefix.log
printf '%s\n' "${SERVICE:0:10}" >"$f"
leak_scan "$f" >/dev/null && ok "short prefix is not a leak" || no "short prefix is not a leak"

# Missing targets and missing sources are skipped.
leak_scan "$T/does-not-exist" >/dev/null && ok "missing target skipped" || no "missing target skipped"
(LEAK_SOURCES=("$T/none"); leak_scan "$T/leak-ANON.log" >/dev/null) && ok "no sources means nothing to find" || no "no sources means nothing to find"

# The values file is removed and nothing else is left in TMPDIR.
left=$(find "$T" -maxdepth 1 -name 'exhibit-leak.*' | wc -l)
[[ "$left" == 0 ]] && ok "temp values file removed" || no "temp values file removed"

# Static checks on the deploy scripts: no set -x, and upstream's
# generate-keys.sh (secrets on stdout and in sed's argv) is never run.
D=$HERE/..
if grep -nE '^[^#]*set -[a-zA-Z]*x' "$D"/*.sh >/dev/null; then no "no set -x in deploy scripts"; else ok "no set -x in deploy scripts"; fi
if grep -nE '^[^#]*(sh|bash|\.|source) [^ ]*generate-keys\.sh' "$D"/*.sh >/dev/null; then
  no "upstream generate-keys.sh never run"
else ok "upstream generate-keys.sh never run"; fi
if grep -nE 'docker compose config( |$)' "$D/bootstrap-vm.sh" | grep -vE 'config (-q|--format json|--services)' | grep -v '^[0-9]*:\s*#' >/dev/null; then
  no "no unfiltered docker compose config"
else ok "no unfiltered docker compose config"; fi

echo "leak tests: $fails failure(s)"
exit $((fails > 0))
