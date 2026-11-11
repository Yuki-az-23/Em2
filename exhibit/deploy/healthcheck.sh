#!/usr/bin/env bash
# =============================================================================
# healthcheck.sh: read-only checks of the exhibit test deployment on the VM.
#
#   sudo bash /path/to/exhibit/deploy/healthcheck.sh
#
# Prints "CHECK <name> PASS|FAIL|WARN|SKIP|INFO <detail>" lines and a RESULT
# line, writes them to /var/log/exhibit-test/health-<ts>.txt, and leak-scans
# that file. Safe to send back. It changes nothing (one anon RPC call spends
# one rate-limit slot for the VM's own address).
#
# bootstrap-vm.sh runs it with --from-bootstrap: the lines then go into the
# bootstrap report ($REPORT) and bootstrap does the result and the leak scan.
# Exit: 0 all PASS, 1 any FAIL, 2 leak found in the output file.
# =============================================================================
set -uo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

FROM_BOOTSTRAP=0
[[ "${1:-}" == --from-bootstrap ]] && FROM_BOOTSTRAP=1
TS=$(date -u +%Y%m%dT%H%M%SZ)
if ((FROM_BOOTSTRAP == 0)) || [[ -z "${REPORT:-}" ]]; then
  install -d -m 700 "$EXHIBIT_LOGDIR"
  REPORT=$EXHIBIT_LOGDIR/health-$TS.txt
  : >"$REPORT"
  chmod 600 "$REPORT"
  FROM_BOOTSTRAP=0
fi

SB=$EXHIBIT_BASE/supabase
GW=http://127.0.0.1:8000
ZERO=00000000-0000-0000-0000-000000000000
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if ! load_config "$EXHIBIT_CONFIG" 2>/dev/null; then
  check hc_config FAIL "cannot read $EXHIBIT_CONFIG"
  DOMAIN="" BOT_USERNAME="" CF_TUNNEL_TOKEN=""
fi
API="https://api-test.${DOMAIN}"

# Keys stay in variables and reach curl only through curl_auth's config file.
ANON=$(env_get "$SB/.env" ANON_KEY 2>/dev/null || true)
SERVICE=$(env_get "$SB/.env" SERVICE_ROLE_KEY 2>/dev/null || true)
[[ -n "$ANON" && -n "$SERVICE" ]] || check hc_keys FAIL "ANON_KEY or SERVICE_ROLE_KEY not found in $SB/.env"

sql() { (cd "$SB" && docker compose exec -T db psql -U postgres -d postgres -tAc "$1" </dev/null 2>/dev/null); }

# --- containers --------------------------------------------------------------
for c in supabase-db supabase-auth supabase-rest realtime-dev.supabase-realtime supabase-storage supabase-imgproxy supabase-studio supabase-envoy; do
  s=$(container_state "$c")
  if [[ "$s" == healthy ]]; then check "container_$c" PASS; else check "container_$c" FAIL "$s"; fi
done
s=$(container_state supabase-meta)
if [[ "$s" == running ]]; then check container_supabase-meta PASS; else check container_supabase-meta FAIL "$s"; fi
for c in supabase-edge-functions supabase-pooler; do
  s=$(container_state "$c")
  if [[ "$s" == absent ]]; then check "absent_$c" PASS; else check "absent_$c" FAIL "present ($s); profile off not applied"; fi
done
if [[ -n "${CF_TUNNEL_TOKEN:-}" ]]; then
  code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:20241/ready 2>/dev/null || true)
  if [[ "$code" == 200 ]]; then check cloudflared_ready PASS; else check cloudflared_ready FAIL "/ready returned ${code:-none}"; fi
else
  check cloudflared_ready SKIP "no CF_TUNNEL_TOKEN in config"
fi

# --- listeners: nothing but :22 on a non-loopback address ---------------------
exposed=()
gw_listen=0
metrics_listen=0
ssh_listen=0
ss_ok=0
ss_out=""
if command -v ss >/dev/null 2>&1 && ss_out=$(ss -Hltn 2>/dev/null); then ss_ok=1; fi
while read -r local_addr; do
  [[ -z "$local_addr" ]] && continue
  port=${local_addr##*:}
  addr=${local_addr%:*}
  if is_loopback_addr "$addr"; then
    [[ "$port" == 8000 && "$addr" == 127.0.0.1 ]] && gw_listen=1
    [[ "$port" == 20241 && "$addr" == 127.0.0.1 ]] && metrics_listen=1
  elif [[ "$port" == 22 ]]; then
    ssh_listen=1
  else
    exposed+=("$local_addr")
  fi
done < <(printf '%s\n' "$ss_out" | awk 'NF >= 4 {print $4}')
# An empty or failed `ss` must not read as "nothing exposed".
if ((ss_ok == 0)); then
  check listeners FAIL "cannot list listeners: ss is missing or failed (install iproute2)"
elif ((${#exposed[@]})); then
  check listeners FAIL "non-loopback listeners: ${exposed[*]}"
elif ((ssh_listen == 0)); then
  check listeners FAIL "no :22 listener on a non-loopback address; ss output not trusted"
else
  check listeners PASS "only :22 on non-loopback addresses"
fi
if ((gw_listen)); then check gateway_loopback PASS "127.0.0.1:8000"; else check gateway_loopback FAIL "nothing on 127.0.0.1:8000"; fi
if [[ -n "${CF_TUNNEL_TOKEN:-}" ]]; then
  if ((metrics_listen)); then check metrics_loopback PASS "127.0.0.1:20241"; else check metrics_loopback FAIL "nothing on 127.0.0.1:20241"; fi
fi

# --- HTTP against the gateway on loopback ------------------------------------
code=$(http_code_auth "$ANON" GET "$GW/auth/v1/health" /dev/null)
if [[ "$code" == 200 ]]; then check auth_health PASS; else check auth_health FAIL "HTTP $code"; fi

body=$TMP/settings.json
code=$(http_code_auth "$ANON" GET "$GW/rest/v1/app_settings?key=eq.telegram_bot&select=key" "$body")
rows=$(jq 'length' "$body" 2>/dev/null || echo "?")
if [[ "$code" == 200 && "$rows" == 1 ]]; then check rest_anon_read PASS; else check rest_anon_read FAIL "HTTP $code rows=$rows"; fi

body=$TMP/rpc.json
uuid=$(cat /proc/sys/kernel/random/uuid)
code=$(http_code_auth "$ANON" POST "$GW/rest/v1/rpc/react_to_post" "$body" \
  -H 'Content-Type: application/json' \
  --data "{\"p_post\":\"$uuid\",\"p_kind\":\"trigger\",\"p_emotion\":\"joy\",\"p_color\":\"yellow\"}")
if grep -q '42883' "$body" 2>/dev/null || grep -qi 'does not exist' "$body" 2>/dev/null; then
  check rpc_search_path FAIL "react_to_post hit 42883/does not exist (function search_path not pinned?)"
elif grep -q 'NOT_FOUND' "$body" 2>/dev/null; then
  check rpc_search_path PASS "react_to_post reached NOT_FOUND"
elif grep -q 'RATE_LIMITED' "$body" 2>/dev/null; then
  check rpc_search_path WARN "rate limited; re-run in a minute"
else
  check rpc_search_path FAIL "unexpected HTTP $code"
fi

for method in PATCH DELETE; do
  args=()
  [[ "$method" == PATCH ]] && args=(-H 'Content-Type: application/json' --data '{"handle":"healthcheck"}')
  code=$(http_code_auth "$ANON" "$method" "$GW/rest/v1/public_profiles?id=eq.$ZERO" /dev/null "${args[@]}")
  case "$code" in
    401 | 403) check "anon_${method,,}_public_profiles" PASS "HTTP $code" ;;
    *) check "anon_${method,,}_public_profiles" FAIL "HTTP $code (anon must not write public_profiles)" ;;
  esac
done

code=$(http_code_auth "$SERVICE" GET "$GW/storage/v1/bucket/post-images" /dev/null)
if [[ "$code" == 200 ]]; then check storage_bucket PASS "post-images"; else check storage_bucket FAIL "HTTP $code"; fi

code=$(http_code_auth "$ANON" GET "$GW/functions/v1/x" /dev/null)
check functions_off INFO "/functions/v1 HTTP $code (503 expected)"

# Realtime websocket upgrade (the apikey goes in the query string, so the URL
# is passed through a curl config file).
ws_code() { # BASEURL
  local cfg=$TMP/ws.cfg
  printf 'url = "%s/realtime/v1/websocket?apikey=%s&vsn=1.0.0"\n' "$1" "$ANON" >"$cfg"
  curl -s -m 5 -o /dev/null -w '%{http_code}' --http1.1 -K "$cfg" \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: SGVhbHRoY2hlY2stZXhoaWJpdA==' 2>/dev/null || true
  rm -f "$cfg"
}
code=$(ws_code "$GW")
if [[ "$code" == 101 ]]; then check realtime_ws PASS "101 on loopback"; else check realtime_ws WARN "HTTP ${code:-none} on loopback (101 expected)"; fi

# --- through the tunnel -------------------------------------------------------
if [[ -n "${CF_TUNNEL_TOKEN:-}" && -n "$DOMAIN" ]]; then
  body=$TMP/tunnel.json
  code=$(http_code_auth "$ANON" GET "$API/rest/v1/app_settings?key=eq.telegram_bot&select=key" "$body")
  if [[ "$code" == 200 ]]; then check tunnel_rest PASS "$API/rest/v1"; else check tunnel_rest FAIL "$API/rest/v1 HTTP $code"; fi
  code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$API/" 2>/dev/null || true)
  if [[ "$code" == 403 ]]; then check waf_root PASS "$API/ blocked (403)"; else check waf_root FAIL "$API/ returned $code; the WAF path rule must block it"; fi
  code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$API/pg/meta/default/tables" 2>/dev/null || true)
  if [[ "$code" == 403 ]]; then check waf_pg PASS "/pg blocked (403)"; else check waf_pg FAIL "$API/pg returned $code"; fi
  code=$(ws_code "$API")
  if [[ "$code" == 101 ]]; then check tunnel_realtime PASS "101 through the tunnel"; else check tunnel_realtime WARN "HTTP ${code:-none} (WebSockets on in the zone?)"; fi
else
  check tunnel_rest SKIP "no tunnel configured"
fi

# --- SQL ---------------------------------------------------------------------
n=$(sql "SELECT count(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public'")
if [[ "$n" == 3 ]]; then check realtime_publication PASS "3 tables"; else check realtime_publication FAIL "${n:-?} public tables (expected 3)"; fi
bot=$(sql "SELECT value FROM public.app_settings WHERE key = 'telegram_bot'")
if [[ -n "${BOT_USERNAME:-}" && "$bot" == "$BOT_USERNAME" ]]; then check telegram_bot PASS "$bot"; else check telegram_bot FAIL "is '${bot}', config says '${BOT_USERNAME:-}'"; fi
u=$(sql "SELECT position('request.jwt.claims' in pg_get_functiondef('auth.uid()'::regprocedure)) > 0")
if [[ "$u" == t ]]; then check auth_uid PASS "reads request.jwt.claims"; else check auth_uid FAIL "${u:-?}"; fi

# --- backup ------------------------------------------------------------------
st_file=$EXHIBIT_STATEDIR/backup.status
if [[ -f "$st_file" ]]; then
  st=$(cat "$st_file")
  age=$(($(date +%s) - $(stat -c %Y "$st_file")))
  if [[ "$st" == ok* && $age -lt $((26 * 3600)) ]]; then check backup_fresh PASS "$st"; else check backup_fresh FAIL "'$st', $((age / 3600)) h old"; fi
else
  check backup_fresh FAIL "no $st_file"
fi
if systemctl is-enabled exhibit-test-backup.timer >/dev/null 2>&1; then check backup_timer PASS; else check backup_timer FAIL "timer not enabled"; fi

# --- outbound (informational) ------------------------------------------------
if getent hosts region1.v2.argotunnel.com >/dev/null 2>&1; then check net_argotunnel INFO "resolves"; else check net_argotunnel INFO "does not resolve"; fi

if ((FROM_BOOTSTRAP)); then
  exit 0
fi
result=PASS
rc=0
if report_has_fail "$REPORT"; then result=FAIL rc=1; fi
report_note "RESULT: $result"
if ! leak_scan "$REPORT"; then
  echo "RESULT: FAIL (secret leak in the output file, do not send it)"
  exit 2
fi
echo "Health output: $REPORT"
exit "$rc"
