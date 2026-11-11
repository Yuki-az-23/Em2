#!/usr/bin/env bash
# =============================================================================
# bootstrap-vm.sh: set up the exhibit's test backend on one Ubuntu 24.04 VM.
#
#   sudo bash exhibit/deploy/bootstrap-vm.sh
#
# Run it from a checkout of this repository (or a copy of exhibit/deploy/ with
# lib.sh next to it). It reads /etc/exhibit-test/config (root, mode 600; see
# config.example), installs Docker, runs Supabase self-hosted (pinned tag) on
# the VM's loopback, applies exhibit/supabase/schema.sql at EM2_REF, starts
# cloudflared, installs a nightly backup, and prints a PASS/FAIL report.
#
# Send back ONLY the report file it names at the end. The transcript
# (/var/log/exhibit-test/run-*.log) is for local debugging and stays on the VM.
#
# Idempotent: re-running keeps every generated secret. Secrets are never
# printed; the script ends with a leak scan of its own transcript and report.
# Never add `set -x` here.
# =============================================================================
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Pinned versions.
SUPABASE_REPO=https://github.com/supabase/supabase
SUPABASE_TAG=self-hosted/v0.8.4
SUPABASE_SHA=189adda99d1b56da55fc5a6ee3f849354aaea92a
CLOUDFLARED_IMAGE=cloudflare/cloudflared:2026.9.0
MIN_COMPOSE=2.24.0
MIN_DISK_GB=40
MIN_DISK_GB_RERUN=10
MIN_RAM_KB=$((7680 * 1024)) # 7.5 GiB

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi
if [[ ! -r "$SCRIPT_DIR/lib.sh" ]]; then
  echo "lib.sh not found next to $0; run the script from exhibit/deploy/ of a checkout" >&2
  exit 1
fi
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

BASE=$EXHIBIT_BASE
SB=$BASE/supabase
EDGE=$BASE/edge
SECRETS=$EXHIBIT_SECRETS
LOGDIR=$EXHIBIT_LOGDIR
STATEDIR=$EXHIBIT_STATEDIR
TS=$(date -u +%Y%m%dT%H%M%SZ)

install -d -m 700 "$LOGDIR" "$SECRETS"
TRANSCRIPT=$LOGDIR/run-$TS.log
REPORT=$LOGDIR/report-$TS.txt
: >"$TRANSCRIPT"
: >"$REPORT"
chmod 600 "$TRANSCRIPT" "$REPORT"
export REPORT

# Everything from here on goes to the terminal and the transcript.
exec > >(tee -a "$TRANSCRIPT") 2>&1

MAIN_PID=$BASHPID
STEP=0
STEP_NAME=start
FINISHED=0

begin_step() {
  STEP=$1
  STEP_NAME=$2
  printf '\n==> step %s: %s\n' "$STEP" "$STEP_NAME"
}

# The report is built only from check/report_note lines. finish() decides
# the result, scans for leaks, and prints the report.
finish() {
  trap - ERR
  set +e
  if ((FINISHED)); then exit 1; fi
  FINISHED=1
  local result=PASS rc=0
  if report_has_fail "$REPORT"; then result=FAIL rc=1; fi
  report_note "RESULT: $result"
  echo
  if ! leak_scan "$TRANSCRIPT" "$REPORT"; then
    echo "RESULT: FAIL (secret leak, do not send logs)"
    echo "Do not send the transcript or the report. Re-run after fixing the cause."
    exit 2
  fi
  echo "----- report: $REPORT -----"
  cat "$REPORT"
  echo "----- end of report -----"
  echo
  echo "RESULT: $result"
  echo "Send back ONLY: $REPORT"
  echo
  echo "Next, on your own machine (not on the VM, and not inside the git checkout):"
  echo "  mkdir -p ~/.config/exhibit-test && chmod 700 ~/.config/exhibit-test"
  echo "  ssh ubuntu@<vm> sudo cat $SECRETS/cloudflare-handoff.env > ~/.config/exhibit-test/handoff.env"
  echo "  chmod 600 ~/.config/exhibit-test/handoff.env"
  echo "  then run exhibit/deploy/cloudflare-test.sh from a checkout of EM2_REF."
  exit "$rc"
}

# shellcheck disable=SC2329 # invoked by the ERR trap
on_err() {
  local code=$1 line=$2
  # A failing subshell only exits; its parent's trap reports the step once.
  if [[ $BASHPID != "$MAIN_PID" ]]; then exit "$code"; fi
  trap - ERR
  check "step${STEP}" FAIL "${STEP_NAME} stopped (line ${line}, exit ${code}); see the transcript on the VM"
  finish
}
trap 'on_err $? $LINENO' ERR

# die NAME DETAIL : record a FAIL and stop.
die() {
  check "$1" FAIL "$2"
  finish
}

# Supabase compose, run from its directory so .env (and COMPOSE_FILE) apply.
sbc() { (cd "$SB" && docker compose "$@"); }
# psql in the db container as postgres (peer auth maps root to postgres).
sb_psql() { sbc exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
sb_sql() { sb_psql -tAc "$1" </dev/null; }

# -----------------------------------------------------------------------------
# 0. Preflight
# -----------------------------------------------------------------------------
step_preflight() {
  begin_step 0 preflight
  report_note "exhibit-test bootstrap $TS (script dir $SCRIPT_DIR)"

  local os_id os_ver os_code
  read -r os_id os_ver os_code < <(. /etc/os-release && printf '%s %s %s\n' "${ID:-?}" "${VERSION_ID:-?}" "${VERSION_CODENAME:-?}")
  OS_CODENAME=$os_code
  [[ "$os_id" == ubuntu ]] || die os "not Ubuntu ($os_id $os_ver)"
  if [[ "$os_ver" == 24.04 ]]; then check os PASS "Ubuntu $os_ver"; else check os WARN "Ubuntu $os_ver, tested only on 24.04"; fi

  local cfg=$EXHIBIT_CONFIG
  [[ -f "$cfg" ]] || die config "missing $cfg (copy config.example there, root, mode 600)"
  local mode owner
  mode=$(stat -c %a "$cfg")
  owner=$(stat -c %U "$cfg")
  [[ "$mode" == 600 && "$owner" == root ]] || die config "$cfg must be owned by root with mode 600 (is $owner $mode)"
  load_config "$cfg" || die config "cannot parse $cfg"
  local problems
  problems=$(validate_config) || {
    while IFS= read -r p; do check config FAIL "$p"; done <<<"$problems"
    finish
  }
  check config PASS "DOMAIN=$DOMAIN BOT_USERNAME=$BOT_USERNAME EM2_REF=${EM2_REF:-<this checkout>} SEED_DEMO=$SEED_DEMO tunnel=$([[ -n "$CF_TUNNEL_TOKEN" ]] && echo set || echo unset)"

  local mem_kb
  mem_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
  if ((mem_kb < MIN_RAM_KB)); then check ram WARN "$((mem_kb / 1024)) MiB, 8 GB recommended"; else check ram PASS "$((mem_kb / 1024)) MiB"; fi

  local avail need=$MIN_DISK_GB
  [[ -f "$SB/.supabase-version" ]] && need=$MIN_DISK_GB_RERUN
  avail=$(df -BG --output=avail / | tail -n1 | tr -dc '0-9')
  if ((avail < need)); then
    die disk "${avail}G free on /, need ${need}G: on Proxmox run 'qm resize <vmid> scsi0 80G', then grow the partition (growpart + resize2fs) or reboot"
  fi
  check disk PASS "${avail}G free on /"

  local netfail=0
  if getent hosts archive.ubuntu.com >/dev/null; then check net_dns PASS; else check net_dns FAIL "cannot resolve archive.ubuntu.com"; netfail=1; fi
  if curl -sI -m 10 -o /dev/null http://archive.ubuntu.com/ubuntu/; then check net_apt PASS; else check net_apt FAIL "http://archive.ubuntu.com unreachable (outbound 80/tcp blocked?)"; netfail=1; fi
  if curl -sI -m 10 -o /dev/null https://download.docker.com; then check net_docker PASS; else check net_docker FAIL "https://download.docker.com unreachable (outbound 443/tcp blocked?)"; netfail=1; fi
  if curl -sI -m 10 -o /dev/null https://github.com; then check net_github PASS; else check net_github FAIL "https://github.com unreachable"; netfail=1; fi
  ((netfail == 0)) || die net "outbound network checks failed; Proxmox outbound must allow 53, 80, 123, 443 and 7844"
}

# -----------------------------------------------------------------------------
# 1. Packages and Docker (from Docker's apt repository)
# -----------------------------------------------------------------------------
step_packages() {
  begin_step 1 packages
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y -q ca-certificates curl git jq openssl ufw python3 >/dev/null
  check packages PASS "ca-certificates curl git jq openssl ufw python3"

  local have=""
  if command -v docker >/dev/null 2>&1; then have=$(docker compose version --short 2>/dev/null || true); fi
  if [[ -n "$have" ]] && version_ge "$have" "$MIN_COMPOSE"; then
    check docker_install PASS "already installed (compose $have)"
  else
    local pkg
    for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
      if dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q 'install ok installed'; then
        apt-get remove -y -q "$pkg" >/dev/null
      fi
    done
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
      "$(dpkg --print-architecture)" "$OS_CODENAME" >/etc/apt/sources.list.d/docker.list
    chmod 644 /etc/apt/sources.list.d/docker.list
    apt-get update -q
    apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
    check docker_install PASS "installed from download.docker.com"
  fi
  systemctl enable --now docker >/dev/null 2>&1 || systemctl start docker
  have=$(docker compose version --short)
  version_ge "$have" "$MIN_COMPOSE" || die docker_compose "compose $have is older than $MIN_COMPOSE"

  local held=() v
  for pkg in docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin; do
    if dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q 'install ok installed'; then held+=("$pkg"); fi
  done
  if ((${#held[@]})); then apt-mark hold "${held[@]}" >/dev/null; fi
  v=$(dpkg-query -W -f='${Version}' docker-ce 2>/dev/null || echo unknown)
  check docker PASS "docker-ce $v, compose $have, held: ${held[*]:-none}"
}

# -----------------------------------------------------------------------------
# 2. Firewall: inbound SSH from SSH_ALLOW_CIDR only
# -----------------------------------------------------------------------------
step_firewall() {
  begin_step 2 firewall
  local peers=() ip p ss_out
  if [[ -n "${SSH_CLIENT:-}" ]]; then peers+=("${SSH_CLIENT%% *}"); fi
  # sudo usually drops SSH_CLIENT, so also read the peers of live SSH sessions.
  # A missing or failing `ss` would look like "no SSH session": stop instead.
  command -v ss >/dev/null 2>&1 || die ssh_peer "ss is missing (install iproute2); cannot check SSH peers before the firewall"
  ss_out=$(ss -Htn state established '( sport = :22 )' 2>/dev/null) ||
    die ssh_peer "ss failed; cannot check SSH peers before the firewall"
  # The firewall opens only 22/tcp: sshd must listen there, or SSH is lost.
  ss -Hltn '( sport = :22 )' 2>/dev/null | grep -q . ||
    die ssh_peer "nothing listens on :22 (or ss failed); the firewall opens only 22/tcp"
  check ssh_listener PASS "sshd listens on :22"

  while read -r p; do
    [[ -z "$p" ]] && continue
    ip=${p%:*}
    ip=${ip#[}
    ip=${ip%]}
    peers+=("$ip")
  done < <(printf '%s\n' "$ss_out" | awk 'NF {print $NF}')
  if ((${#peers[@]} == 0)); then
    check ssh_peer WARN "no SSH session found (console run?); cannot confirm SSH_ALLOW_CIDR covers you"
  else
    for ip in "${peers[@]}"; do
      ip_in_cidr "$ip" "$SSH_ALLOW_CIDR" ||
        die ssh_peer "SSH client $ip is outside SSH_ALLOW_CIDR=$SSH_ALLOW_CIDR; enabling the firewall would lock you out"
    done
    check ssh_peer PASS "${#peers[@]} SSH peer(s) inside $SSH_ALLOW_CIDR"
  fi
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow from "$SSH_ALLOW_CIDR" to any port 22 proto tcp >/dev/null
  ufw --force enable >/dev/null
  check ufw PASS "deny incoming, allow outgoing, 22/tcp from $SSH_ALLOW_CIDR"
}

# -----------------------------------------------------------------------------
# 3. Em2 checkout at EM2_REF (or the checkout this script runs from)
# -----------------------------------------------------------------------------
step_em2() {
  begin_step 3 em2_checkout
  install -d -m 755 "$BASE"
  if [[ -n "$EM2_REF" ]]; then
    local dir=$BASE/em2 head
    if [[ ! -d "$dir/.git" ]]; then
      (umask 022 && git init -q "$dir" && git -C "$dir" remote add origin "$EM2_REPO")
    else
      git -C "$dir" remote set-url origin "$EM2_REPO"
    fi
    (umask 022 && git -C "$dir" fetch -q --depth 1 origin "$EM2_REF") ||
      die em2_fetch "cannot fetch $EM2_REF from $EM2_REPO (private repository? leave EM2_REF empty to use this checkout)"
    (umask 022 && git -C "$dir" checkout -q -f --detach FETCH_HEAD)
    head=$(git -C "$dir" rev-parse HEAD)
    [[ "$head" == "$EM2_REF" ]] || die em2_ref "HEAD $head is not EM2_REF"
    EXHIBIT_SRC=$dir/exhibit
    EM2_SHA=$head
    check em2_ref PASS "$EM2_SHA from $EM2_REPO"
  else
    EXHIBIT_SRC=$(cd "$SCRIPT_DIR/.." && pwd)
    EM2_SHA=$(git -c safe.directory='*' -C "$EXHIBIT_SRC" rev-parse HEAD 2>/dev/null || echo unknown)
    local dirty=""
    if [[ "$EM2_SHA" != unknown ]] && [[ -n "$(git -c safe.directory='*' -C "$EXHIBIT_SRC" status --porcelain -- supabase 2>/dev/null)" ]]; then
      dirty=" (supabase/ has local changes)"
    fi
    check em2_ref WARN "EM2_REF empty: using this checkout at $EM2_SHA$dirty"
  fi
  [[ -r "$EXHIBIT_SRC/supabase/schema.sql" && -r "$EXHIBIT_SRC/supabase/smoke.sql" ]] ||
    die em2_files "schema.sql or smoke.sql missing under $EXHIBIT_SRC/supabase"
  grep -qF 'extensions, pg_temp' "$EXHIBIT_SRC/supabase/schema.sql" ||
    die em2_fixes "EM2_REF lacks fixes: schema.sql does not pin 'search_path = public, extensions, pg_temp'"
  grep -qF 'SET LOCAL ROLE anon' "$EXHIBIT_SRC/supabase/smoke.sql" ||
    die em2_fixes "EM2_REF lacks fixes: smoke.sql has no anon privilege block"
  check em2_fixes PASS "schema pins search_path; smoke checks anon"
}

# -----------------------------------------------------------------------------
# 4. Supabase self-hosted at the pinned tag
# -----------------------------------------------------------------------------
step_supabase_checkout() {
  begin_step 4 supabase_checkout
  local verfile=$SB/.supabase-version want="$SUPABASE_TAG $SUPABASE_SHA" src=$BASE/src-supabase sha
  if [[ -f "$verfile" ]]; then
    [[ "$(cat "$verfile")" == "$want" ]] ||
      die supabase_version "$SB holds '$(cat "$verfile")', expected '$want'; upgrading is a manual step"
    check supabase_version PASS "$SUPABASE_TAG already in place"
  else
    rm -rf "$src"
    # Containers read these files as non-root users: copy them world-readable.
    (umask 022 &&
      git clone -q --filter=blob:none --sparse --depth 1 --branch "$SUPABASE_TAG" "$SUPABASE_REPO" "$src" &&
      git -C "$src" sparse-checkout set docker)
    sha=$(git -C "$src" rev-parse HEAD)
    [[ "$sha" == "$SUPABASE_SHA" ]] || die supabase_sha "$SUPABASE_TAG resolved to $sha, expected $SUPABASE_SHA"
    (umask 022 && install -d -m 755 "$SB" && cp -a "$src/docker/." "$SB/")
    [[ -f "$SB/docker-compose.yml" && -f "$SB/.env.example" ]] ||
      die supabase_files "docker/ at $SUPABASE_TAG lacks docker-compose.yml or .env.example"
    printf '%s\n' "$want" >"$verfile"
    chmod 644 "$verfile"
    check supabase_version PASS "cloned $SUPABASE_TAG ($SUPABASE_SHA)"
  fi
  install -m 644 "$SCRIPT_DIR/supabase/docker-compose.exhibit.yml" "$SB/docker-compose.exhibit.yml"
}

# -----------------------------------------------------------------------------
# 5. Secrets (generated once; never regenerated while .env has them)
# -----------------------------------------------------------------------------
env_has_placeholders() {
  local cur example
  cur=$(env_get "$SB/.env" JWT_SECRET || true)
  example=$(env_get "$SB/.env.example" JWT_SECRET || true)
  [[ -z "$cur" || "$cur" == "$example" ]]
}

step_secrets() {
  begin_step 5 secrets
  local envf=$SB/.env backup=$SECRETS/env.backup fresh=0 restored=0
  if [[ ! -f "$envf" ]]; then
    if [[ -f "$backup" ]]; then
      install -m 600 "$backup" "$envf"
      restored=1
      check secrets PASS "restored $envf from $backup (same keys)"
    else
      if [[ -n "$(ls -A "$SB/volumes/db/data" 2>/dev/null)" ]]; then
        die secrets "$envf and $backup are missing but a database exists in volumes/db/data; new keys would not match it. Restore $backup, or wipe volumes/db/data first"
      fi
      fresh=1
    fi
  elif env_has_placeholders; then
    if [[ -n "$(ls -A "$SB/volumes/db/data" 2>/dev/null)" ]]; then
      die secrets "$envf still has example keys but a database exists in volumes/db/data; restore $backup or reset the data"
    fi
    fresh=1
  fi

  if ((fresh)); then
    install -m 600 "$SB/.env.example" "$envf"
    # Not upstream's utils/generate-keys.sh: it prints every secret and
    # passes them to sed on argv. Same values, generated and written here.
    generate_supabase_keys "$envf" || die secrets "generating keys failed"
    chmod 600 "$envf"
    check secrets PASS "generated new keys into $envf"
  elif ((restored == 0)); then
    check secrets PASS "kept existing keys in $envf"
  fi
  chmod 600 "$envf"

  # Presence checks only: never print a value.
  local k
  for k in JWT_SECRET POSTGRES_PASSWORD DASHBOARD_PASSWORD; do
    [[ -n "$(env_get "$envf" "$k" || true)" ]] || die secrets "$k missing from $envf"
  done
  grep -q '^ANON_KEY=ey' "$envf" || die secrets "ANON_KEY missing from $envf"
  grep -q '^SERVICE_ROLE_KEY=ey' "$envf" || die secrets "SERVICE_ROLE_KEY missing from $envf"
  env_has_placeholders && die secrets "$envf still has the example JWT_SECRET"

  # The Telegram webhook secret is ours; generate it once.
  local sfile=$SECRETS/secrets.txt hook
  [[ -f "$sfile" ]] || install -m 600 /dev/null "$sfile"
  hook=$(env_get "$sfile" TELEGRAM_WEBHOOK_SECRET || true)
  if [[ ! "$hook" =~ ^[0-9a-f]{64}$ ]]; then
    hook=$(openssl rand -hex 32)
    env_upsert "$sfile" TELEGRAM_WEBHOOK_SECRET "$hook"
    check webhook_secret PASS "generated into $sfile"
  else
    check webhook_secret PASS "kept existing in $sfile"
  fi
  chmod 600 "$sfile"
  cp -p "$envf" "$backup"
  chmod 600 "$backup"
}

# The handoff file for cloudflare-test.sh: exactly five KEY= lines.
write_handoff() {
  local hf=$SECRETS/cloudflare-handoff.env tmp anon service hook
  anon=$(env_get "$SB/.env" ANON_KEY)
  service=$(env_get "$SB/.env" SERVICE_ROLE_KEY)
  hook=$(env_get "$SECRETS/secrets.txt" TELEGRAM_WEBHOOK_SECRET)
  tmp=$(mktemp "$SECRETS/.handoff.XXXXXX")
  {
    printf 'DOMAIN=%s\n' "$DOMAIN"
    printf 'SUPABASE_URL=https://api-test.%s\n' "$DOMAIN"
    printf 'ANON_KEY=%s\n' "$anon"
    printf 'SERVICE_ROLE_KEY=%s\n' "$service"
    printf 'TELEGRAM_WEBHOOK_SECRET=%s\n' "$hook"
  } >"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$hf"
  check handoff PASS "$hf (mode 600, 5 lines)"
}

# -----------------------------------------------------------------------------
# 6. Overrides and compose validation
# -----------------------------------------------------------------------------
step_overrides() {
  begin_step 6 overrides
  local keys
  keys=$(env_apply_template "$SCRIPT_DIR/supabase/env.exhibit-test" "$SB/.env" "$DOMAIN" | tr '\n' ' ')
  chmod 600 "$SB/.env"
  cp -p "$SB/.env" "$SECRETS/env.backup"
  check env_overrides PASS "set: $keys"

  sbc config -q >/dev/null 2>&1 || die compose_config "docker compose config failed in $SB (run it there by hand; it prints secrets)"
  local ips services
  ips=$(sbc config --format json 2>/dev/null | jq -r '.services["api-gw"].ports[].host_ip' | sort -u | tr '\n' ' ')
  [[ "$ips" == "127.0.0.1 " ]] || die gateway_bind "api-gw publishes on '${ips% }', expected 127.0.0.1 only"
  check gateway_bind PASS "api-gw on 127.0.0.1:8000"
  services=$(sbc config --services 2>/dev/null)
  if grep -qxE 'functions|supavisor' <<<"$services"; then
    die compose_profiles "functions or supavisor still enabled; COMPOSE_FILE must include docker-compose.exhibit.yml"
  fi
  check compose_profiles PASS "functions and supavisor off"
}

# -----------------------------------------------------------------------------
# 7. Start and wait for health
# -----------------------------------------------------------------------------
SB_HEALTHY=(supabase-db supabase-auth supabase-rest realtime-dev.supabase-realtime supabase-storage supabase-imgproxy supabase-studio supabase-envoy)
SB_RUNNING=(supabase-meta)

stack_waiting() {
  local c s waiting=()
  for c in "${SB_HEALTHY[@]}"; do
    s=$(container_state "$c")
    [[ "$s" == healthy ]] || waiting+=("$c=$s")
  done
  for c in "${SB_RUNNING[@]}"; do
    s=$(container_state "$c")
    [[ "$s" == running ]] || waiting+=("$c=$s")
  done
  printf '%s' "${waiting[*]}"
}

step_start() {
  begin_step 7 start
  sbc pull -q
  if ! sbc up -d; then
    check compose_up WARN "first 'up -d' returned an error; waiting for health anyway"
  fi
  local deadline=$((SECONDS + 600)) waiting retried=0
  while :; do
    waiting=$(stack_waiting)
    [[ -z "$waiting" ]] && break
    if ((SECONDS >= deadline)); then die stack_health "not healthy after 600 s: $waiting"; fi
    if ((retried == 0 && SECONDS >= deadline - 300)); then
      sbc up -d >/dev/null 2>&1 || true
      retried=1
    fi
    sleep 5
  done
  check stack_health PASS "${#SB_HEALTHY[@]} healthy, meta running"
}

# -----------------------------------------------------------------------------
# 8. Readiness gates inside Postgres
# -----------------------------------------------------------------------------
step_ready() {
  begin_step 8 db_ready
  local deadline=$((SECONDS + 300)) a b
  while :; do
    a=$(sb_sql "SELECT to_regclass('storage.buckets') IS NOT NULL" 2>/dev/null || true)
    b=$(sb_sql "SELECT position('request.jwt.claims' in pg_get_functiondef('auth.uid()'::regprocedure)) > 0" 2>/dev/null || true)
    [[ "$a" == t && "$b" == t ]] && break
    ((SECONDS >= deadline)) && die db_ready "storage.buckets=${a:-?} auth.uid-claims=${b:-?} after 300 s"
    sleep 5
  done
  check db_ready PASS "storage.buckets exists; auth.uid() reads request.jwt.claims"
}

# -----------------------------------------------------------------------------
# 9-12. Schema, smoke gate, settings, optional demo seed
# -----------------------------------------------------------------------------
step_schema() {
  begin_step 9 schema
  local log=$LOGDIR/schema-$TS.log rc=0
  sb_psql <"$EXHIBIT_SRC/supabase/schema.sql" >"$log" 2>&1 || rc=$?
  chmod 600 "$log"
  ((rc == 0)) || die schema "psql exit $rc; log $log"
  check schema PASS "applied at ${EM2_SHA:0:12}; log $log"
}

step_smoke() {
  begin_step 10 smoke
  local posts log=$LOGDIR/smoke-$TS.log rc=0
  posts=$(sb_sql "SELECT count(*) FROM public.posts")
  if [[ "$posts" != 0 ]]; then
    check smoke SKIP "public.posts has $posts rows; smoke runs only on an empty wall"
    return 0
  fi
  sb_psql <"$EXHIBIT_SRC/supabase/smoke.sql" >"$log" 2>&1 || rc=$?
  chmod 600 "$log"
  ((rc == 0)) || die smoke "psql exit $rc; log $log"
  check smoke PASS "all blocks passed (rolled back); log $log"
}

step_settings() {
  begin_step 11 settings
  printf "UPDATE public.app_settings SET value = :'bot' WHERE key = 'telegram_bot';\n" |
    sb_psql -q -v bot="$BOT_USERNAME" >/dev/null
  local got
  got=$(sb_sql "SELECT value FROM public.app_settings WHERE key = 'telegram_bot'")
  [[ "$got" == "$BOT_USERNAME" ]] || die settings "telegram_bot is '$got', expected $BOT_USERNAME"
  check settings PASS "telegram_bot=$BOT_USERNAME"
}

step_seed() {
  begin_step 12 demo_seed
  if [[ "$SEED_DEMO" != 1 ]]; then
    check demo_seed SKIP "SEED_DEMO=0"
    return 0
  fi
  local n
  n=$(sb_sql "SELECT count(*) FROM public.posts WHERE provenance->>'seed' = 'demo'")
  if [[ "$n" != 0 ]]; then
    check demo_seed SKIP "$n demo posts already present"
    return 0
  fi
  [[ -r "$EXHIBIT_SRC/supabase/seed.sql" ]] || die demo_seed "seed.sql missing"
  sb_psql -q <"$EXHIBIT_SRC/supabase/seed.sql" >/dev/null 2>&1 || die demo_seed "seed.sql failed"
  check demo_seed PASS "applied supabase/seed.sql"
}

# -----------------------------------------------------------------------------
# 13. cloudflared
# -----------------------------------------------------------------------------
step_tunnel() {
  begin_step 13 tunnel
  if [[ -z "$CF_TUNNEL_TOKEN" ]]; then
    check tunnel SKIP "CF_TUNNEL_TOKEN not set in $EXHIBIT_CONFIG"
    return 0
  fi
  install -d -m 700 "$EDGE"
  install -m 644 "$SCRIPT_DIR/edge/docker-compose.yml" "$EDGE/docker-compose.yml"
  [[ -f "$EDGE/.env" ]] || install -m 600 /dev/null "$EDGE/.env"
  env_upsert "$EDGE/.env" TUNNEL_TOKEN "$CF_TUNNEL_TOKEN"
  env_upsert "$EDGE/.env" CLOUDFLARED_IMAGE "$CLOUDFLARED_IMAGE"
  chmod 600 "$EDGE/.env"
  (cd "$EDGE" && docker compose -p exhibit-edge pull -q && docker compose -p exhibit-edge up -d)
  local deadline=$((SECONDS + 60))
  until curl -fsS -m 3 -o /dev/null http://127.0.0.1:20241/ready 2>/dev/null; do
    if ((SECONDS >= deadline)); then
      check tunnel FAIL "cloudflared /ready not 200 after 60 s (token wrong, or 7844 outbound blocked)"
      return 0
    fi
    sleep 3
  done
  check tunnel PASS "$CLOUDFLARED_IMAGE connected; metrics on 127.0.0.1:20241"
}

# -----------------------------------------------------------------------------
# 14. Nightly backups
# -----------------------------------------------------------------------------
step_backup() {
  begin_step 14 backup
  install -m 700 "$SCRIPT_DIR/backup.sh" "$EXHIBIT_SBIN/exhibit-test-backup"
  install -m 644 "$SCRIPT_DIR/systemd/exhibit-test-backup.service" "$EXHIBIT_UNITDIR/exhibit-test-backup.service"
  install -m 644 "$SCRIPT_DIR/systemd/exhibit-test-backup.timer" "$EXHIBIT_UNITDIR/exhibit-test-backup.timer"
  systemctl daemon-reload
  systemctl enable --now exhibit-test-backup.timer >/dev/null 2>&1
  if systemctl start exhibit-test-backup.service; then :; fi
  local st
  st=$(cat "$STATEDIR/backup.status" 2>/dev/null || echo "none")
  if [[ "$st" == ok* ]]; then check backup PASS "timer enabled; first run: $st"; else check backup FAIL "first run: $st (journalctl -u exhibit-test-backup)"; fi
}

# -----------------------------------------------------------------------------
# 15. Health, versions, report
# -----------------------------------------------------------------------------
step_health() {
  begin_step 15 health
  bash "$SCRIPT_DIR/healthcheck.sh" --from-bootstrap || true

  check version_docker INFO "$(docker version -f '{{.Server.Version}}' 2>/dev/null || echo ?) compose $(docker compose version --short 2>/dev/null || echo ?)"
  check version_em2 INFO "${EM2_SHA:-unknown}"
  check version_supabase INFO "$SUPABASE_TAG $SUPABASE_SHA"
  local c img digest
  for c in "${SB_HEALTHY[@]}" "${SB_RUNNING[@]}" exhibit-edge-cloudflared-1; do
    img=$(docker inspect -f '{{.Config.Image}}' "$c" 2>/dev/null) || continue
    digest=$(docker image inspect -f '{{join .RepoDigests ","}}' "$img" 2>/dev/null || echo ?)
    check "image_${c}" INFO "$img ${digest##*@}"
  done
  check disk_after INFO "$(df -h --output=avail,size / | tail -n1 | awk '{print $1 " free of " $2}') on /"
  check ram_after INFO "$(free -m | awk '/^Mem:/ {print $7 " MiB available of " $2}')"
  report_note "NOTE: create the WAF rule for api-test and the Access app for studio-test BEFORE adding tunnel routes."
  report_note "NOTE: Studio basic auth user is in DASHBOARD_USERNAME; its password is DASHBOARD_PASSWORD in $SB/.env (root only)."
}

main() {
  step_preflight
  step_packages
  step_firewall
  step_em2
  step_supabase_checkout
  step_secrets
  write_handoff
  step_overrides
  step_start
  step_ready
  step_schema
  step_smoke
  step_settings
  step_seed
  step_tunnel
  step_backup
  step_health
  finish
}

main "$@"
