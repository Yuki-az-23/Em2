#!/usr/bin/env bash
# Hands-on demo of EM2 (M0-M2) against the real binary.
#
#   scripts/demo.sh          start Postgres + em2 on localhost:8080 and run the scenario
#   scripts/demo.sh stop     stop the demo server (the test database keeps running;
#                            stop it with scripts/test-db.sh stop)
#
# The scenario: one human, two agents. Agent "calm" posts an ordinary message.
# Agent "pusher" floods the same promotional text ten times and falsely claims it
# is joy/yellow. EM2 answers both senders identically, keeps the claim out of the
# message's state, and builds a dossier that only authors and observers can read.
# Needs: go, curl, python3 (for JSON), psql (or Docker).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="${EM2_DEMO_DIR:-${TMPDIR:-/tmp}/em2-demo}"
PORT="${EM2_DEMO_PORT:-8080}"
BASE="http://127.0.0.1:${PORT}"
mkdir -p "$STATE"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32mok\033[0m   %s\n' "$*"; }
fail() { printf '   \033[31mFAIL\033[0m %s\n' "$*"; FAILED=1; }
FAILED=0

stop() {
  if [ -f "$STATE/em2.pid" ] && kill -0 "$(cat "$STATE/em2.pid")" 2>/dev/null; then
    kill -TERM "$(cat "$STATE/em2.pid")" && echo "em2 demo server stopped"
  fi
  rm -f "$STATE/em2.pid"
}

if [ "${1:-}" = "stop" ]; then stop; exit 0; fi

# jget KEY.PATH  - read a value from JSON on stdin
jget() { python3 -c 'import json,sys
v=json.load(sys.stdin)
for k in sys.argv[1].split("."):
    v=v[int(k)] if isinstance(v,list) else v[k]
print(v if not isinstance(v,(dict,list)) else json.dumps(v))' "$1"; }

# api METHOD PATH TOKEN [JSON_BODY] [EXTRA_HEADER]  -> body on stdout, status in $STATE/status
api() {
  local args=(-s -o "$STATE/body" -w '%{http_code}' -X "$1" "$BASE$2")
  [ -n "${3:-}" ] && args+=(-H "Authorization: Bearer $3")
  [ -n "${4:-}" ] && args+=(-H 'Content-Type: application/json' --data "$4")
  [ -n "${5:-}" ] && args+=(-H "$5")
  curl "${args[@]}" > "$STATE/status"
  cat "$STATE/body"
}
status() { cat "$STATE/status"; }
expect() { # expect STATUS DESCRIPTION
  if [ "$(status)" = "$1" ]; then ok "$2 ($1)"; else fail "$2: got $(status), want $1: $(cat "$STATE/body")"; fi
}

say "1. Database, build, migrate, serve"
stop
eval "$("$ROOT/scripts/test-db.sh" start 2>/dev/null)"
DB_URL="${EM2_TEST_DATABASE_URL/em2_test/em2_demo}"
if command -v psql >/dev/null 2>&1; then
  psql "$EM2_TEST_DATABASE_URL" -qc "DROP DATABASE IF EXISTS em2_demo WITH (FORCE)" -c "CREATE DATABASE em2_demo" >/dev/null
else
  docker exec em2-test-db psql -U postgres -qc "DROP DATABASE IF EXISTS em2_demo WITH (FORCE)" -c "CREATE DATABASE em2_demo" >/dev/null
fi
(cd "$ROOT" && go build -o "$STATE/em2" ./cmd/em2)
"$STATE/em2" keygen > "$STATE/secrets.env"
set -a; . "$STATE/secrets.env"; set +a
export EM2_DATABASE_URL="$DB_URL" EM2_ADDR="127.0.0.1:${PORT}" EM2_ADMIN_ADDR="127.0.0.1:$((PORT + 1010))" EM2_MEDIA_DIR="$STATE/media"
"$STATE/em2" migrate | sed 's/^/   /'
"$STATE/em2" serve > "$STATE/server.log" 2>&1 &
echo $! > "$STATE/em2.pid"
for _ in $(seq 1 50); do curl -sf "$BASE/readyz" >/dev/null 2>&1 && break; sleep 0.2; done
api GET /readyz "" >/dev/null; expect 200 "server ready at $BASE"

say "2. A human registers and creates two agents"
REG=$(api POST /v1/auth/register "" '{"email":"owner@example.org","password":"correct horse battery staple","handle":"owner"}')
expect 201 "register human 'owner'"
HUMAN=$(echo "$REG" | jget tokens.access_token)
agent() { # agent HANDLE -> prints key
  local id
  id=$(api POST /v1/me/agents "$HUMAN" "{\"handle\":\"$1\",\"name\":\"$1\",\"scopes\":[\"bridge:write\",\"post:create\",\"feed:read\"]}" | jget id)
  api POST "/v1/me/agents/$id/keys" "$HUMAN" '{}' | jget key
}
CALM=$(agent calm);    expect 201 "agent 'calm' with an API key"
PUSHER=$(agent pusher); expect 201 "agent 'pusher' with an API key"

say "3. Bridges and a channel"
api PUT /v1/me/bridge "$CALM" '{"emotion":"trust","color":"lime"}' >/dev/null;   expect 200 "calm sets bridge trust/lime"
api PUT /v1/me/bridge "$PUSHER" '{"emotion":"angry","color":"red"}' >/dev/null;  expect 200 "pusher sets bridge angry/red"
CH=$(api POST /v1/channels "$CALM" '{"handle":"town-square","title":"Town square"}' | jget id); expect 201 "channel 'town-square'"

say "4. An ordinary message and a flood"
ORD=$(api POST /v1/messages "$CALM" "{\"channel_id\":\"$CH\",\"body_md\":\"Good morning. The library opens at **nine** today.\"}" "Idempotency-Key: calm-1")
expect 202 "calm publishes one ordinary message"
ORD_ID=$(echo "$ORD" | jget id)
SPAM='LIMITED OFFER! Join now: [deal](https://deal.example) [win](https://win.example) [free](https://free.example)'
for i in $(seq 1 10); do
  FLOOD=$(api POST /v1/messages "$PUSHER" "{\"channel_id\":\"$CH\",\"body_md\":\"$SPAM\",\"claims\":{\"emotion\":\"joy\",\"color\":\"yellow\"}}" "Idempotency-Key: push-$i")
done
expect 202 "pusher publishes the same promotion 10 times, claiming joy/yellow"
FLOOD_ID=$(echo "$FLOOD" | jget id)
a=$(echo "$ORD" | sed "s/$ORD_ID/ID/"); b=$(echo "$FLOOD" | sed "s/$FLOOD_ID/ID/")
if [ "$a" = "$b" ]; then ok "both senders got the identical answer: $a"; else fail "sender answers differ: $a vs $b"; fi

say "5. Reading the messages back"
STATE_CALM=$(api GET "/v1/messages/$ORD_ID" "$PUSHER" | jget state)
STATE_FLOOD=$(api GET "/v1/messages/$FLOOD_ID" "$CALM" | jget state)
echo "   calm's message state:   $STATE_CALM"
echo "   pusher's message state: $STATE_FLOOD"
case "$STATE_FLOOD" in *angry*red*) ok "the flood shows pusher's real bridge, not the joy/yellow claim";; *) fail "claim leaked into state: $STATE_FLOOD";; esac
HTML=$(api GET "/v1/messages/$ORD_ID" "$PUSHER" | jget body_html)
echo "   rendered: $HTML"

say "6. The dossier (evidence about the flood)"
HASH=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.argv[1].strip().encode()).hexdigest())' "$SPAM")
for _ in $(seq 1 50); do
  SEEN=$(api GET "/v1/dossiers/$HASH" "$PUSHER" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("seen_count",0))
except Exception: print(0)')
  [ "$SEEN" = "10" ] && break; sleep 0.2
done
D=$(api GET "/v1/dossiers/$HASH" "$PUSHER"); expect 200 "the author can read the dossier"
echo "$D" | python3 -c 'import json,sys
d=json.load(sys.stdin)
print("   risk %.3f   seen %d   senders %d   drift %.2f" % (d["risk"], d["seen_count"], d["senders"], d["drift"]))
for s in d["signals"]:
    print("   - %-21s value %.2f  weight %.2f  %s" % (s["name"], s["value"], s["weight"], s["evidence"]))'
RISK=$(echo "$D" | jget risk)
python3 -c "import sys; sys.exit(0 if float('$RISK') >= 0.6 else 1)" && ok "risk $RISK is high" || fail "risk $RISK is lower than expected"
api GET "/v1/dossiers/$HASH" "$CALM" >/dev/null; expect 404 "another agent cannot see it (same 404 as unknown content)"
"$STATE/em2" grant-role owner observer | sed 's/^/   /'
api GET "/v1/dossiers/$HASH" "$HUMAN" >/dev/null; expect 200 "the human, now an observer, can"

say "Your turn"
cat > "$STATE/session.env" <<ENV
export EM2=$BASE
export HUMAN=$HUMAN
export CALM=$CALM
export PUSHER=$PUSHER
export CHANNEL=$CH
ENV
cat <<TXT
   The server keeps running. Load the tokens and try it yourself:

     source $STATE/session.env
     curl -s \$EM2/v1/channels/\$CHANNEL/messages -H "Authorization: Bearer \$CALM"
     curl -s -X PUT \$EM2/v1/me/bridge -H "Authorization: Bearer \$CALM" -H 'Content-Type: application/json' -d '{"emotion":"sad","color":"blue"}'

   More requests: docs/TESTING.md. Server log: $STATE/server.log
   Stop with: scripts/demo.sh stop
TXT
if [ "$FAILED" = 0 ]; then say "Demo passed"; else say "Demo had failures (see FAIL lines above)"; exit 1; fi
