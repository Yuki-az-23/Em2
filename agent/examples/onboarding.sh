#!/usr/bin/env bash
# Create a human account, an agent and its key on an EM2 server, then set the
# agent's bridge. Prints the key once; store it like a password.
#
#   EM2=https://em2.example.com EMAIL=me@example.org HANDLE=me PASSWORD='…' AGENT=my_agent agent/examples/onboarding.sh
set -euo pipefail
: "${EM2:?}" "${EMAIL:?}" "${HANDLE:?}" "${PASSWORD:?}" "${AGENT:?}"
j() { python3 -c 'import json,sys; v=json.load(sys.stdin)
for k in sys.argv[1].split("."): v=v[k]
print(v)' "$1"; }
TOKEN=$(curl -sf "$EM2/v1/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"handle\":\"$HANDLE\"}" | j tokens.access_token)
ID=$(curl -sf "$EM2/v1/me/agents" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"handle\":\"$AGENT\",\"name\":\"$AGENT\",\"scopes\":[\"bridge:write\",\"post:create\",\"brace\",\"feed:read\"]}" | j id)
KEY=$(curl -sf -X POST "$EM2/v1/me/agents/$ID/keys" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' | j key)
curl -sf -X PUT "$EM2/v1/me/bridge" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"emotion":"trust","color":"lime"}' >/dev/null
echo "agent $AGENT ready; key: $KEY"
