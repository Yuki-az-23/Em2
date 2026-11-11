#!/usr/bin/env bash
# cloudflare-test.sh: the owner-machine half of the exhibit test deployment.
#
# Run it from a checkout of the same EM2_REF the VM runs, after bootstrap-vm.sh
# reported PASS and after `npx --no-install wrangler login`:
#
#   mkdir -p -m 700 ~/.config/exhibit-test
#   ssh ubuntu@<vm> sudo cat /root/exhibit-test/cloudflare-handoff.env > ~/.config/exhibit-test/handoff.env
#   chmod 600 ~/.config/exhibit-test/handoff.env
#   bash exhibit/deploy/cloudflare-test.sh
#
# It creates the R2 bucket and its domain, deploys the Worker (--env test) and
# sets its secrets, builds and deploys the site, points the Telegram webhook at
# the Worker, and checks everything from outside. It prints PASS/FAIL lines and
# never prints a secret: values reach wrangler and curl only on stdin, never in
# argv, and the site build sees only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
#
# Works with bash 3.2 (macOS) and later. Needs node >= 20, npm, curl and jq.
set -Eeuo pipefail
umask 077
export WRANGLER_SEND_METRICS=false

BUCKET=hermes-images-test
WORKER_ENV="test"
HANDOFF_KEYS="DOMAIN SUPABASE_URL ANON_KEY SERVICE_ROLE_KEY TELEGRAM_WEBHOOK_SECRET"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
EXHIBIT=$(cd "$SCRIPT_DIR/.." && pwd)
HANDOFF=$HOME/.config/exhibit-test/handoff.env

FAILS=0
STEP="start"
TMP_FILES=""

say()   { printf '%s\n' "$*"; }
check() { # check NAME PASS|FAIL|WARN|INFO|SKIP [detail]
  printf 'CHECK %-28s %-4s %s\n' "$1" "$2" "${3:-}"
  if [ "$2" = FAIL ]; then FAILS=$((FAILS + 1)); fi
}
die() { check "$STEP" FAIL "$*"; finish; }
# mktmp VAR : creates a mode-600 temp file, stores its path in VAR and
# registers it for shredding. It must run in this shell, never inside $(...):
# a subshell's TMP_FILES change would be lost and the file never removed.
mktmp() {
  local _f
  _f=$(umask 077 && mktemp "${TMPDIR:-/tmp}/exhibit-test.XXXXXX") || return 1
  chmod 600 "$_f"
  TMP_FILES="$TMP_FILES $_f"
  printf -v "$1" '%s' "$_f"
}
cleanup() {
  local f
  for f in $TMP_FILES; do
    if [ -f "$f" ]; then
      if command -v shred >/dev/null 2>&1; then shred -u "$f" 2>/dev/null || rm -f "$f"; else rm -f "$f"; fi
    fi
  done
}
finish() {
  cleanup
  say ""
  if [ "$FAILS" -eq 0 ]; then say "RESULT: PASS"; else say "RESULT: FAIL ($FAILS failed check(s), last step: $STEP)"; fi
  say "After the test, remove the handoff file: shred -u \"$HANDOFF\" (or rm -P on macOS)"
  if [ "$FAILS" -eq 0 ]; then exit 0; else exit 1; fi
}
# shellcheck disable=SC2329  # called from the ERR trap
on_err() { # in a subshell, just leave; the parent reports
  if [ "${BASH_SUBSHELL:-0}" -gt 0 ]; then exit 1; fi
  check "$STEP" FAIL "command failed (line $1)"
  finish
}
trap 'on_err $LINENO' ERR
trap cleanup EXIT
trap 'say ""; check "$STEP" FAIL "interrupted"; finish' INT TERM

wr() { npx --no-install wrangler "$@"; }

file_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }

# ---------------------------------------------------------------------------
STEP="0-preflight"
say "== 0. Preflight and handoff file"

for tool in node npm curl jq; do
  command -v "$tool" >/dev/null 2>&1 || die "missing tool: $tool"
done
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "node $NODE_MAJOR is too old, wrangler 4 needs node 20 or newer"
check tools PASS "node $(node -v), npm $(npm -v)"

# The handoff file must never be inside the git tree, not even ignored.
REPO_ROOT=$(git -C "$EXHIBIT" rev-parse --show-toplevel 2>/dev/null || (cd "$EXHIBIT/.." && pwd))
IN_TREE=$(find "$REPO_ROOT" \( -name node_modules -o -name .git \) -prune -o \( -name handoff.env -o -name '*.handoff.env' \) -print 2>/dev/null | head -n 5 || true)
if [ -n "$IN_TREE" ]; then
  say "Found a handoff file inside the repository:"
  say "$IN_TREE"
  die "move it to $HANDOFF (mode 600) and delete the copy in the repository"
fi
check handoff_outside_repo PASS

[ -f "$HANDOFF" ] || die "no handoff file at $HANDOFF"
MODE=$(file_mode "$HANDOFF")
[ "$MODE" = 600 ] || die "handoff file mode is $MODE, run: chmod 600 \"$HANDOFF\""
DIR_MODE=$(file_mode "$(dirname "$HANDOFF")")
case "$DIR_MODE" in
  700) check handoff_dir_mode PASS ;;
  *)   check handoff_dir_mode WARN "directory mode is $DIR_MODE, 700 recommended" ;;
esac

# Strict parse, without sourcing: exactly the five keys, each once, nothing else.
DOMAIN="" SUPABASE_URL="" ANON_KEY="" SERVICE_ROLE_KEY="" TELEGRAM_WEBHOOK_SECRET=""
SEEN=" "
LINE_NO=0
while IFS= read -r line || [ -n "$line" ]; do
  LINE_NO=$((LINE_NO + 1))
  if ! [[ $line =~ ^[A-Z_]+= ]]; then die "handoff line $LINE_NO is not KEY=value (wrong file, or a login banner?)"; fi
  key=${line%%=*}
  value=${line#*=}
  case " $HANDOFF_KEYS " in *" $key "*) ;; *) die "handoff line $LINE_NO has unexpected key $key" ;; esac
  case "$SEEN" in *" $key "*) die "handoff key $key appears twice" ;; esac
  SEEN="$SEEN$key "
  case "$key" in
    DOMAIN) DOMAIN=$value ;;
    SUPABASE_URL) SUPABASE_URL=$value ;;
    ANON_KEY) ANON_KEY=$value ;;
    SERVICE_ROLE_KEY) SERVICE_ROLE_KEY=$value ;;
    TELEGRAM_WEBHOOK_SECRET) TELEGRAM_WEBHOOK_SECRET=$value ;;
  esac
done < "$HANDOFF"
[ "$LINE_NO" -eq 5 ] || die "handoff file has $LINE_NO lines, expected exactly 5"

RE_DOMAIN='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
RE_JWT='^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
RE_HEX64='^[0-9a-f]{64}$'
[[ $DOMAIN =~ $RE_DOMAIN ]] || die "DOMAIN is not a lowercase domain name"
[ "$SUPABASE_URL" = "https://api-test.$DOMAIN" ] || die "SUPABASE_URL must be https://api-test.<DOMAIN>"
[[ $ANON_KEY =~ $RE_JWT ]] || die "ANON_KEY is not JWT-shaped"
[[ $SERVICE_ROLE_KEY =~ $RE_JWT ]] || die "SERVICE_ROLE_KEY is not JWT-shaped"
[ "$ANON_KEY" != "$SERVICE_ROLE_KEY" ] || die "ANON_KEY and SERVICE_ROLE_KEY are the same"
[[ $TELEGRAM_WEBHOOK_SECRET =~ $RE_HEX64 ]] || die "TELEGRAM_WEBHOOK_SECRET is not 64 hex characters"
check handoff_valid PASS "domain $DOMAIN"

API_HOST="api-test.$DOMAIN"
STUDIO_HOST="studio-test.$DOMAIN"
HERMES_HOST="hermes-test.$DOMAIN"
SITE_HOST="exhibit-test.$DOMAIN"
IMAGES_HOST="images-test.$DOMAIN"

# The Wrangler configs carry the hostnames; they must name the handoff's domain.
CONFIG_OK=1
grep -qF "\"hermes-test.$DOMAIN\"" "$EXHIBIT/worker/wrangler.jsonc" || CONFIG_OK=0
grep -qF "\"https://images-test.$DOMAIN\"" "$EXHIBIT/worker/wrangler.jsonc" || CONFIG_OK=0
grep -qF "\"$BUCKET\"" "$EXHIBIT/worker/wrangler.jsonc" || CONFIG_OK=0
grep -qF "\"exhibit-test.$DOMAIN\"" "$EXHIBIT/wrangler.site.jsonc" || CONFIG_OK=0
if [ "$CONFIG_OK" -ne 1 ]; then
  say "worker/wrangler.jsonc (env.test) and wrangler.site.jsonc must name $DOMAIN and bucket $BUCKET."
  say "If they name another domain, change it in both files, for example:"
  say "  sed -i.bak 's/solorpunk\\.com/$DOMAIN/g' \"$EXHIBIT/worker/wrangler.jsonc\" \"$EXHIBIT/wrangler.site.jsonc\""
  say "Commit the change too if the VM copy comes from git archive."
  die "Wrangler configs do not match DOMAIN"
fi
check wrangler_configs PASS "hosts on $DOMAIN"

# The site build reads .env files too; refuse any that could add VITE_ values.
for f in .env .env.local .env.production .env.production.local; do
  if [ -f "$EXHIBIT/$f" ] && grep -q '^[[:space:]]*VITE_' "$EXHIBIT/$f"; then
    die "exhibit/$f defines VITE_ values that would enter the site build; move it aside for this run"
  fi
done

# The bot token is typed, never stored in a file and never echoed.
[ -t 0 ] || die "run this in a terminal: it asks for the bot token"
TELEGRAM_BOT_TOKEN=""
printf 'Telegram test bot token (input hidden): ' >&2
IFS= read -rs TELEGRAM_BOT_TOKEN
printf '\n' >&2
RE_TOKEN='^[0-9]+:[A-Za-z0-9_-]{30,}$'
[[ $TELEGRAM_BOT_TOKEN =~ $RE_TOKEN ]] || die "that does not look like a bot token (digits:30+ characters)"
check bot_token_format PASS

# ---------------------------------------------------------------------------
STEP="1-tooling"
say "== 1. Tooling"
cd "$EXHIBIT"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  check lockfile WARN "no package-lock.json, falling back to npm install"
  npm install --no-audit --no-fund
fi
WANT_WRANGLER=$(node -p 'require("./worker/package.json").devDependencies.wrangler')
HAVE_WRANGLER=$(wr --version 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)
[ "$HAVE_WRANGLER" = "$WANT_WRANGLER" ] || die "wrangler is ${HAVE_WRANGLER:-missing}, expected $WANT_WRANGLER"
check wrangler_version PASS "$HAVE_WRANGLER"
wr whoami --json >/dev/null 2>&1 || die "not logged in: run npx --no-install wrangler login"
check wrangler_login PASS

# ---------------------------------------------------------------------------
STEP="2-r2"
say "== 2. R2 bucket $BUCKET and $IMAGES_HOST"
if wr r2 bucket info "$BUCKET" >/dev/null 2>&1; then
  check r2_bucket PASS "exists"
else
  wr r2 bucket create "$BUCKET"
  check r2_bucket PASS "created"
fi
if wr r2 bucket domain list "$BUCKET" 2>/dev/null | grep -qF "$IMAGES_HOST"; then
  check r2_domain PASS "$IMAGES_HOST exists"
else
  ZONE_ID=${CF_ZONE_ID:-}
  if [ -z "$ZONE_ID" ]; then
    printf 'Zone ID of %s (dashboard > %s > Overview, right column): ' "$DOMAIN" "$DOMAIN" >&2
    IFS= read -r ZONE_ID
  fi
  RE_ZONE='^[0-9a-f]{32}$'
  [[ $ZONE_ID =~ $RE_ZONE ]] || die "zone ID must be 32 hex characters"
  wr r2 bucket domain add "$BUCKET" --domain "$IMAGES_HOST" --zone-id "$ZONE_ID" --min-tls 1.2 --force
  check r2_domain PASS "$IMAGES_HOST added"
fi

# ---------------------------------------------------------------------------
# Deploy first, then set secrets: `secret put` on a Worker that does not exist
# yet would create an empty one. Until the secrets land, /telegram answers 403
# (no secret configured) and /health shows hasDb/hasBot false.
STEP="3-worker"
say "== 3. Worker hermes-test (--env $WORKER_ENV)"
(cd "$EXHIBIT/worker" && wr deploy --env "$WORKER_ENV")
check worker_deploy PASS

STEP="4-secrets"
say "== 4. Worker secrets (through stdin)"
put_secret() { # put_secret NAME VALUE
  printf '%s' "$2" | (cd "$EXHIBIT/worker" && wr secret put "$1" --env "$WORKER_ENV") >/dev/null
  check "secret_$1" PASS
}
put_secret SUPABASE_URL "$SUPABASE_URL"
put_secret SUPABASE_SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"
put_secret TELEGRAM_BOT_TOKEN "$TELEGRAM_BOT_TOKEN"
put_secret TELEGRAM_WEBHOOK_SECRET "$TELEGRAM_WEBHOOK_SECRET"

# ---------------------------------------------------------------------------
STEP="5-site"
say "== 5. Site build and deploy ($SITE_HOST)"
rm -rf "$EXHIBIT/dist"
# A clean environment: only PATH, HOME and the two public VITE_ values.
(
  cd "$EXHIBIT"
  env -i PATH="$PATH" HOME="$HOME" LANG="${LANG:-C.UTF-8}" \
    VITE_SUPABASE_URL="$SUPABASE_URL" VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
    npm run build >/dev/null
)
grep -rqF "$API_HOST" "$EXHIBIT/dist/assets" || die "the built site does not name $API_HOST"
check site_build PASS
mktmp SECRETS_LIST
printf '%s\n%s\n%s\n' "$SERVICE_ROLE_KEY" "$TELEGRAM_BOT_TOKEN" "$TELEGRAM_WEBHOOK_SECRET" > "$SECRETS_LIST"
if grep -rqF -f "$SECRETS_LIST" "$EXHIBIT/dist"; then
  rm -rf "$EXHIBIT/dist"
  die "a secret ended up in the site build; dist/ deleted, nothing deployed"
fi
check site_no_secrets PASS
(cd "$EXHIBIT" && wr deploy -c wrangler.site.jsonc)
check site_deploy PASS

# ---------------------------------------------------------------------------
STEP="6-telegram"
say "== 6. Telegram webhook"
# The token and the secret go to curl in a config read from stdin, never in argv.
tg_config() { # tg_config METHOD [extra config lines]
  printf 'url = "https://api.telegram.org/bot%s/%s"\n' "$TELEGRAM_BOT_TOKEN" "$1"
  if [ $# -gt 1 ]; then printf '%s\n' "$2"; fi
}
SET_RESULT=$(tg_config setWebhook "data-urlencode = \"secret_token=$TELEGRAM_WEBHOOK_SECRET\"" \
  | curl -sS -m 30 -K - \
      --data-urlencode "url=https://$HERMES_HOST/telegram" \
      --data-urlencode 'allowed_updates=["message"]' \
      --data-urlencode 'drop_pending_updates=true') || die "could not reach api.telegram.org"
jqv() { printf '%s' "$1" | jq -r "$2" 2>/dev/null || true; }   # jqv JSON FILTER; never echoes the input
if [ "$(jqv "$SET_RESULT" '.ok')" = true ]; then
  check telegram_set_webhook PASS
else
  check telegram_set_webhook FAIL "$(jqv "$SET_RESULT" '.description // "no description"')"
fi
INFO=$(tg_config getWebhookInfo | curl -sS -m 30 -K -) || die "could not reach api.telegram.org"
WH_URL=$(jqv "$INFO" '.result.url // ""')
WH_UPDATES=$(jqv "$INFO" '.result.allowed_updates // [] | tojson')
WH_PENDING=$(jqv "$INFO" '.result.pending_update_count // 0')
WH_ERROR=$(jqv "$INFO" '.result.last_error_message // ""')
if [ "$WH_URL" = "https://$HERMES_HOST/telegram" ] && [ "$WH_UPDATES" = '["message"]' ]; then
  check telegram_webhook_info PASS "pending=$WH_PENDING${WH_ERROR:+ last_error=$WH_ERROR}"
else
  check telegram_webhook_info FAIL "url=$WH_URL allowed_updates=$WH_UPDATES"
fi

# ---------------------------------------------------------------------------
STEP="7-checks"
say "== 7. External checks"
http_code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@" || true; }

# New custom domains can take a minute or two for DNS and certificates.
HEALTH_OK=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  HEALTH=$(curl -s -m 10 "https://$HERMES_HOST/health" || true)
  if [ "$(jqv "$HEALTH" '(.hasDb == true and .hasBot == true)')" = true ]; then HEALTH_OK=1; break; fi
  sleep 10
done
if [ "$HEALTH_OK" -eq 1 ]; then check worker_health PASS "hasDb and hasBot true"
else check worker_health FAIL "https://$HERMES_HOST/health did not report hasDb and hasBot true"; fi

CODE=$(http_code -X POST -H 'Content-Type: application/json' --data '{}' "https://$HERMES_HOST/telegram")
if [ "$CODE" = 403 ]; then check telegram_needs_secret PASS "403"; else check telegram_needs_secret FAIL "got $CODE, want 403"; fi

for page in root wall; do
  path=/; [ "$page" = wall ] && path=/wall
  CODE=000
  for _ in 1 2 3 4 5 6; do
    CODE=$(http_code "https://$SITE_HOST$path")
    [ "$CODE" = 200 ] && break
    sleep 10
  done
  if [ "$CODE" = 200 ]; then check "site_$page" PASS "200"; else check "site_$page" FAIL "got $CODE"; fi
done

# The anon key is public, but it still goes through stdin like the others.
CODE=$(printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' "$ANON_KEY" "$ANON_KEY" \
  | curl -s -o /dev/null -m 20 -w '%{http_code}' -K - "https://$API_HOST/rest/v1/app_settings?select=key&limit=1" || true)
if [ "$CODE" = 200 ]; then check api_rest PASS "200"; else check api_rest FAIL "got $CODE"; fi

CODE=$(http_code "https://$API_HOST/")
if [ "$CODE" = 403 ]; then check api_root_blocked PASS "403 (WAF)"; else check api_root_blocked FAIL "got $CODE, want 403: check the WAF rule"; fi

STUDIO=$(curl -s -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' "https://$STUDIO_HOST/" || true)
case "$STUDIO" in
  30[0-9]\ *cloudflareaccess.com*) check studio_behind_access PASS "redirects to Access" ;;
  *) check studio_behind_access FAIL "got ${STUDIO%% *}, want a redirect to cloudflareaccess.com" ;;
esac

CODE=$(http_code "https://$IMAGES_HOST/not-there.png")
case "$CODE" in
  404) check images_domain PASS "404 for a missing object" ;;
  *)   check images_domain WARN "got $CODE (a new R2 domain can take a few minutes)" ;;
esac

check workers_dev INFO "workers_dev and preview_urls are false in both configs; no *.workers.dev route"

finish
