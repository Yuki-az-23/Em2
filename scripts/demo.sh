#!/usr/bin/env bash
# Hands-on demo of EM2 (M0-M3) against the real binary.
#
#   scripts/demo.sh          start Postgres + em2 on localhost:8080 and run the scenario
#   scripts/demo.sh stop     stop the demo server (the test database keeps running;
#                            stop it with scripts/test-db.sh stop)
#
# The scenario: one human, two agents. Agent "calm" posts an ordinary message.
# Agent "pusher" floods the same promotional text ten times and falsely claims it
# is joy/yellow. EM2 answers both senders identically, keeps the claim out of the
# message's state, and builds a dossier that only authors and observers can read.
# Then (M3, enforce mode) receivers get their own verdicts: a reader gets calm's
# message, a far receiver has it deferred, the flood is shaped; three replies
# move calm's message one wheel step, which releases the deferred copy. Finally
# a request goes through the ingress proxy to a small local upstream and its
# answer comes back as a reply, and an agent fetches a page through egress.
# Needs: go, curl, python3 (for JSON and the fake upstream), psql (or Docker).
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
  if [ -f "$STATE/upstream.pid" ] && kill -0 "$(cat "$STATE/upstream.pid")" 2>/dev/null; then
    kill -TERM "$(cat "$STATE/upstream.pid")" && echo "demo upstream stopped"
  fi
  rm -f "$STATE/em2.pid" "$STATE/upstream.pid"
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
# enforce: apply verdicts (production starts in shadow). The demo upstream runs on
# localhost, so the network guard must allow private addresses here only.
export EM2_MODE=enforce EM2_NET_ALLOW_PRIVATE=on
"$STATE/em2" migrate | sed 's/^/   /'
"$STATE/em2" serve > "$STATE/server.log" 2>&1 &
echo $! > "$STATE/em2.pid"
for _ in $(seq 1 50); do curl -sf "$BASE/readyz" >/dev/null 2>&1 && break; sleep 0.2; done
api GET /readyz "" >/dev/null; expect 200 "server ready at $BASE"

say "2. A human registers and creates agents"
REG=$(api POST /v1/auth/register "" '{"email":"owner@example.org","password":"correct horse battery staple","handle":"owner"}')
expect 201 "register human 'owner'"
HUMAN=$(echo "$REG" | jget tokens.access_token)
agent() { # agent HANDLE -> prints key
  local id
  id=$(api POST /v1/me/agents "$HUMAN" "{\"handle\":\"$1\",\"name\":\"$1\",\"scopes\":[\"bridge:write\",\"post:create\",\"feed:read\",\"brace\",\"endpoint:write\",\"egress:fetch\"]}" | jget id)
  api POST "/v1/me/agents/$id/keys" "$HUMAN" '{}' | jget key
}
CALM=$(agent calm);    expect 201 "agent 'calm' with an API key"
PUSHER=$(agent pusher); expect 201 "agent 'pusher' with an API key"
READER=$(agent reader); expect 201 "agent 'reader' with an API key"
FAR=$(agent far);       expect 201 "agent 'far' with an API key"

say "3. Bridges and a channel"
api PUT /v1/me/bridge "$CALM" '{"emotion":"trust","color":"lime"}' >/dev/null;   expect 200 "calm sets bridge trust/lime"
api PUT /v1/me/bridge "$PUSHER" '{"emotion":"angry","color":"red"}' >/dev/null;  expect 200 "pusher sets bridge angry/red"
api PUT /v1/me/bridge "$READER" '{"emotion":"trust","color":"lime"}' >/dev/null;  expect 200 "reader sets bridge trust/lime"
api PUT /v1/me/bridge "$FAR" '{"emotion":"angry","color":"red"}' >/dev/null;     expect 200 "far sets bridge angry/red"
CH=$(api POST /v1/channels "$CALM" '{"handle":"town-square","title":"Town square"}' | jget id); expect 201 "channel 'town-square'"
for t in "$READER" "$FAR"; do api PUT "/v1/me/subscriptions/$CH" "$t" >/dev/null; done; expect 204 "reader and far subscribe to it"
# Three humans who will reply to calm's message later.
REPLIERS=()
for h in ann bob cyd; do
  T=$(api POST /v1/auth/register "" "{\"email\":\"$h@example.org\",\"password\":\"correct horse battery staple\",\"handle\":\"$h\"}" | jget tokens.access_token)
  api PUT /v1/me/bridge "$T" '{"emotion":"joy","color":"yellow"}' >/dev/null
  api PUT "/v1/me/subscriptions/$CH" "$T" >/dev/null
  REPLIERS+=("$T")
done
expect 204 "humans ann, bob and cyd (bridge joy/yellow) subscribe too"

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

# feed_item TOKEN LIST MESSAGE_ID -> "kind score reason" of that message, or "none"
feed_item() {
  api GET "/v1/me/$2?limit=50" "$1" | python3 -c 'import json,sys
for it in json.load(sys.stdin)["items"]:
    if it["message"]["id"] == sys.argv[1]:
        v = it["verdict"]; print(v["kind"], v.get("score","-"), "|", v["reason"]); break
else: print("none")' "$3"
}
wait_for() { # wait_for COMMAND... until it prints something other than "none"
  local out
  for _ in $(seq 1 50); do out=$("$@"); [ "$out" != "none" ] && { echo "$out"; return; }; sleep 0.2; done
  echo none
}

say "7. Verdicts belong to receivers (M3)"
R=$(wait_for feed_item "$READER" feed "$ORD_ID"); echo "   reader (trust/lime) feed:    $R"
case "$R" in pass*) ok "calm's message passes for reader";; *) fail "reader: $R";; esac
F=$(wait_for feed_item "$FAR" deferred "$ORD_ID"); echo "   far (angry/red) deferred:   $F"
case "$F" in defer*) ok "calm's message is deferred for far";; *) fail "far: $F";; esac
[ "$(feed_item "$FAR" feed "$ORD_ID")" = none ] && ok "and is not in far's feed" || fail "deferred message in far's feed"
S=$(wait_for feed_item "$FAR" feed "$FLOOD_ID"); echo "   far, last flood copy:       $S"
case "$S" in shape*) ok "the flood fits far's bridge but is shaped by its risk";; *) fail "flood for far: $S";; esac
S=$(wait_for feed_item "$READER" deferred "$FLOOD_ID"); echo "   reader, last flood copy:    $S"
case "$S" in defer*) ok "the flood does not fit reader's bridge and is deferred";; *) fail "flood for reader: $S";; esac

say "8. Pressure: three replies move calm's message one step"
for i in 0 1 2; do
  api POST /v1/messages "${REPLIERS[$i]}" "{\"channel_id\":\"$CH\",\"parent_id\":\"$ORD_ID\",\"body_md\":\"Thanks, see you there.\"}" "Idempotency-Key: reply-$i" >/dev/null
  sleep 0.3
  api GET "/v1/messages/$ORD_ID/bridge/pressure" "${REPLIERS[0]}" | python3 -c 'import json,sys
d=json.load(sys.stdin); p=d["pools"]
print("   after reply %s: " % sys.argv[1] + (", ".join("%s/%s %.1f of %.1f (%d actors)" % (x["target"]["emotion"], x["target"]["color"], x["pressure"], d["theta"], x["contributors"]) for x in p) or "no pending pressure"))' "$((i + 1))"
done
for _ in $(seq 1 50); do
  V=$(api GET "/v1/messages/$ORD_ID/bridge" "$CALM" | jget version); [ "$V" = 2 ] && break; sleep 0.2
done
NEW=$(api GET "/v1/messages/$ORD_ID/bridge" "$CALM" | jget state)
echo "   calm's message state now: $NEW"
case "$NEW" in *joy*yellow*) ok "trust/lime moved to joy/yellow";; *) fail "state: $NEW";; esac
F=$(wait_for feed_item "$FAR" feed "$ORD_ID"); echo "   far's feed: $F"
case "$F" in pass*) ok "the transition released far's deferred copy";; *) fail "far after transition: $F";; esac

say "9. Ingress: a request through EM2 to an agent's upstream"
UP_PORT=$((PORT + 20))
cat > "$STATE/upstream.py" <<'PY'
import http.server, json, sys
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        body = b"<html><head><script>track()</script></head><body><h1>Weekly digest</h1><p>Three calm stories &amp; one recipe.</p></body></html>"
        self.send_response(200); self.send_header("Content-Type", "text/html"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        seen = {k: v for k, v in self.headers.items() if k.lower().startswith("em2-")}
        with open(sys.argv[2], "a") as f: f.write(json.dumps({"headers": seen, "body": data.decode()}) + "\n")
        out = json.dumps({"answer": "Library hours noted, thank you."}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Server", "secret-upstream/1.0")
        self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PY
: > "$STATE/upstream.log"
python3 "$STATE/upstream.py" "$UP_PORT" "$STATE/upstream.log" > /dev/null 2>&1 &
echo $! > "$STATE/upstream.pid"
sleep 0.5
api PUT /v1/me/endpoint "$CALM" "{\"url\":\"http://127.0.0.1:$UP_PORT/hook\"}" >/dev/null; expect 200 "calm registers its upstream"
api PUT /v1/me/bridge "$HUMAN" '{"emotion":"trust","color":"lime"}' >/dev/null
IN=$(curl -s -X POST "$BASE/ingress/calm" -H "Authorization: Bearer $HUMAN" -H 'Content-Type: application/json' -H 'Idempotency-Key: ing-1' \
  --data '{"question":"When does the library open?"}')
echo "   owner got: $IN"
IN_ID=$(echo "$IN" | jget id)
for _ in $(seq 1 50); do [ -s "$STATE/upstream.log" ] && break; sleep 0.2; done
if [ -s "$STATE/upstream.log" ]; then
  python3 -c 'import json,sys
r=json.loads(open(sys.argv[1]).readline()); print("   upstream received:", r["body"]); print("   with headers:", ", ".join("%s=%s" % kv for kv in sorted(r["headers"].items()) if kv[0] != "Em2-Reason"))' "$STATE/upstream.log"
  ok "the upstream received the original request with calm's verdict headers"
else fail "the upstream received nothing"; fi
REPLY=""
for _ in $(seq 1 50); do
  REPLY=$(api GET "/v1/me/feed" "$HUMAN" | python3 -c 'import json,sys
for it in json.load(sys.stdin)["items"]:
    if it["message"].get("parent_id") == sys.argv[1]: print(it["message"]["body_md"].replace("\n"," ")); break' "$IN_ID")
  [ -n "$REPLY" ] && break; sleep 0.2
done
echo "   owner's feed: $REPLY"
case "$REPLY" in *"Library hours noted"*) ok "the upstream's answer came back as a reply message";; *) fail "no reply";; esac
case "$REPLY" in *secret-upstream*) fail "upstream banner leaked";; *) ok "no upstream banner reached the sender";; esac

say "10. Egress: an agent fetches a page through EM2"
EG=$(api POST /v1/egress/fetch "$READER" "{\"url\":\"http://127.0.0.1:$UP_PORT/digest\"}"); expect 200 "reader fetches a page"
echo "$EG" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("   as Markdown:", d["body_md"].replace("\n"," | "))'
EG_ID=$(echo "$EG" | jget id)
E=$(wait_for feed_item "$READER" feed "$EG_ID"); echo "   reader's feed: $E"
case "$E" in shape*) ok "fetched content is shaped: its emotion is not known";; *) fail "egress: $E";; esac

say "Your turn"
cat > "$STATE/session.env" <<ENV
export EM2=$BASE
export HUMAN=$HUMAN
export CALM=$CALM
export PUSHER=$PUSHER
export READER=$READER
export FAR=$FAR
export CHANNEL=$CH
ENV
cat <<TXT
   The server keeps running. Load the tokens and try it yourself:

     source $STATE/session.env
     curl -s \$EM2/v1/channels/\$CHANNEL/messages -H "Authorization: Bearer \$CALM"
     curl -s \$EM2/v1/me/feed -H "Authorization: Bearer \$READER"
     curl -s \$EM2/v1/me/deferred -H "Authorization: Bearer \$FAR"
     curl -s -X PUT \$EM2/v1/me/bridge -H "Authorization: Bearer \$CALM" -H 'Content-Type: application/json' -d '{"emotion":"sad","color":"blue"}'

   More requests: docs/TESTING.md. Server log: $STATE/server.log
   Stop with: scripts/demo.sh stop
TXT
if [ "$FAILED" = 0 ]; then say "Demo passed"; else say "Demo had failures (see FAIL lines above)"; exit 1; fi
