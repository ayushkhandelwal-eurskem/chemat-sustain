#!/usr/bin/env bash
# Safe production deploy for the CheMatSustain IONOS Docker Compose stack.
# The GitHub Actions workflow updates the checkout before invoking this script.

set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/home/chematsustain}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE=(docker compose -f "$COMPOSE_FILE")
LOCK_FILE="${DEPLOY_LOCK_FILE:-/var/lock/chematsustain-deploy.lock}"
NGINX_IMAGE="${NGINX_IMAGE:-nginx:stable}"
HEALTH_RETRIES="${HEALTH_RETRIES:-40}"
HEALTH_DELAY_SECONDS="${HEALTH_DELAY_SECONDS:-3}"

log() {
  printf '\n=== %s\n' "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  printf '\nDEPLOY FAILED (exit %s). Current service state:\n' "$exit_code" >&2
  "${COMPOSE[@]}" ps >&2 || true
  printf '\nRecent backend/frontend/nginx logs:\n' >&2
  "${COMPOSE[@]}" logs --tail=60 backend frontend nginx >&2 || true
  exit "$exit_code"
}
trap on_error ERR

command -v docker >/dev/null 2>&1 || fail "docker is not installed"
command -v curl >/dev/null 2>&1 || fail "curl is not installed"
command -v flock >/dev/null 2>&1 || fail "flock is not installed"

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  # Every child inherits fd 9, so the lock outlives this script if any child is
  # still alive - including one that was merely SUSPENDED. Pressing Ctrl+Z
  # (SIGTSTP) rather than Ctrl+C leaves the whole pipeline frozen but running,
  # holding the lock, and every later run then fails here. Report who actually
  # holds it instead of just refusing, because "another deployment is already
  # running" is misleading when the real state is "a stopped job from your last
  # attempt".
  printf '\nERROR: another deployment is already running.\n' >&2
  printf '\nProcesses currently holding %s:\n' "$LOCK_FILE" >&2
  if command -v fuser >/dev/null 2>&1; then
    # fuser -v names the exact pids holding the file, which is the authoritative
    # answer. Deliberately not also grepping `ps` for deploy.sh: the lock can be
    # held by a child (sleep, docker) whose command line never mentions this
    # script, and matching on the name mostly produces noise.
    fuser -v "$LOCK_FILE" >&2 2>&1 || true
  fi
  cat >&2 <<'HINT'

Check the state of those pids with `ps -o pid,stat,cmd -p <pid>`. A STAT
containing "T" means stopped, not running - almost certainly a Ctrl+Z'd earlier
run. Clear it with:

    jobs -l                       # if it belongs to this shell
    kill -9 %1
    pkill -9 -f 'scripts/deploy.sh'
    pkill -9 -f 'docker compose exec'

Then re-run. Use Ctrl+C rather than Ctrl+Z to interrupt a deploy.
HINT
  exit 1
fi

cd "$REPO_DIR"
[ -f "$COMPOSE_FILE" ] || fail "$REPO_DIR/$COMPOSE_FILE does not exist"
[ -f .env ] || fail "$REPO_DIR/.env does not exist"

log "Validating environment and Compose configuration"
required_env=(
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL
  KEYCLOAK_DB_USER KEYCLOAK_DB_PASSWORD KEYCLOAK_DB_NAME
  KEYCLOAK_ADMIN_USERNAME KEYCLOAK_ADMIN_PASSWORD
  SMTP_HOST SMTP_PORT SMTP_SECURITY SMTP_SENDER SMTP_USERNAME SMTP_PASSWORD
)
for name in "${required_env[@]}"; do
  grep -Eq "^[[:space:]]*${name}=.+" .env \
    || fail "required variable ${name} is missing or empty in $REPO_DIR/.env
       DATABASE_URL in particular was absent from this host's .env: the older
       code built its connection from POSTGRES_* but security/config.py now
       raises 'DATABASE_URL is required' at import, so the backend will not
       start without it. Compare against .env.example, which lists every
       variable the code actually reads, and see
       docs/security/production-env-reference.md."
done

# Gmail preserves a custom From address only after it is verified under Gmail's
# "Send mail as" settings. Require an explicit acknowledgement for this legacy
# path so a typo cannot silently restore the personal visible sender.
if grep -Eqi '^[[:space:]]*SMTP_HOST=[[:space:]]*smtp\.gmail\.com[[:space:]]*$' .env; then
  grep -Eqi '^[[:space:]]*SMTP_GMAIL_ALIAS_VERIFIED=[[:space:]]*true[[:space:]]*$' .env \
    || fail "Gmail SMTP requires SMTP_GMAIL_ALIAS_VERIFIED=true.
       First route database@eurskem.com to the existing Gmail inbox with
       Cloudflare Email Routing, then verify that address in Gmail's
       Settings > Accounts and Import > Send mail as."
  grep -Eqi '^[[:space:]]*SMTP_SENDER=[[:space:]]*database@eurskem\.com[[:space:]]*$' .env \
    || fail "Gmail alias mode requires SMTP_SENDER=database@eurskem.com."
elif grep -Eqi '^[[:space:]]*SMTP_SENDER=[[:space:]]*ayush\.us255@gmail\.com[[:space:]]*$' .env; then
  fail "SMTP_SENDER must be database@eurskem.com, not a personal mailbox."
fi
"${COMPOSE[@]}" config --quiet

log "Checking persistent host directories"
# The backend image declares `USER appuser` (backend/Dockerfile), so these bind
# mounts must be writable by that UID - not by root. Both directories were found
# root:root mode 755 on this host, which is r-x for appuser: readable, NOT
# writable. That silently breaks uploads, and the container-side check further
# down would abort every deploy.
#
# Checked here, before anything is built or restarted, so the failure costs
# seconds instead of a full build.

# Resolve the UID the backend image actually runs as, from the image itself,
# rather than assuming. Falls back to useradd's default only if inspect fails.
backend_uid="$("${COMPOSE[@]}" config --images 2>/dev/null | head -1 | \
  xargs -r docker image inspect -f '{{.Config.User}}' 2>/dev/null || true)"
case "$backend_uid" in
  ''|appuser|*[!0-9]*) backend_uid=1000 ;;
esac

for directory in \
  /home/chematsustain/protocol_files \
  /home/chematsustain/research_data; do
  [ -d "$directory" ] \
    || fail "persistent directory $directory is missing; create it with ownership suitable for the backend appuser before deploying"

  # Probe writability AS THAT UID against the real mount, instead of deriving it
  # from stat output. An earlier version compared uid and then tested
  # $((0$mode % 10)) < 7, which is wrong twice over: the leading 0 makes bash
  # parse the mode as octal, so 777 became 511 and 511 % 10 = 1 -> a
  # world-writable directory was reported unwritable. 755 gave the right answer
  # only by coincidence. Permission bits also interact with group membership and
  # ACLs, which no amount of arithmetic on the mode captures. Ask the kernel.
  if ! docker run --rm -u "$backend_uid" \
        -v "$directory:/probe" "$NGINX_IMAGE" \
        sh -c 'test -r /probe && test -w /probe' >/dev/null 2>&1; then
    fail "$directory is not readable+writable by uid $backend_uid, which is the
       user the backend runs as (backend/Dockerfile declares USER appuser).
       Current state: $(stat -c 'uid=%u gid=%g mode=%a' "$directory")
       Uploads fail silently in this state, and the container-side mount check
       further down would abort every deploy.
       Fix once, on the host:
         chown -R $backend_uid:$backend_uid $directory
       Do NOT 'chmod 777' instead - these hold research data and protocol
       documents."
  fi
done

log "Validating nginx configuration before changing running services"
docker run --rm \
  --add-host frontend:127.0.0.1 \
  --add-host backend:127.0.0.1 \
  -v "$REPO_DIR/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v /etc/ssl/certs/origin.pem:/etc/ssl/certs/origin.pem:ro \
  -v /etc/ssl/private/origin.key:/etc/ssl/private/origin.key:ro \
  "$NGINX_IMAGE" nginx -t

log "Applying additive resource-access migrations"
for migration in \
  backend/migrations/006_resource_access_grants.sql \
  backend/migrations/007_user_resource_access.sql \
  backend/migrations/008_dynamic_all_tests_rls.sql; do
  "${COMPOSE[@]}" exec -T db psql \
    -U "${POSTGRES_USER:-postgres}" \
    -d "${POSTGRES_DB:-chematsustain}" \
    -v ON_ERROR_STOP=1 -q -f - < "$migration"
done

log "Building application images"
"${COMPOSE[@]}" build

log "Starting or updating services"
"${COMPOSE[@]}" up -d --remove-orphans

# nginx resolves the literal frontend/backend service names when its workers
# start. Recreate it after app containers so it never retains stale container IPs.
log "Recreating nginx to refresh upstream addresses"
"${COMPOSE[@]}" up -d --force-recreate --no-deps nginx

wait_for_url() {
  local label=$1
  local url=$2
  local attempt
  shift 2

  for attempt in $(seq 1 "$HEALTH_RETRIES"); do
    if curl -fsS --max-time 5 "$@" "$url" >/dev/null 2>&1; then
      printf '  %s is responding (attempt %s/%s)\n' "$label" "$attempt" "$HEALTH_RETRIES"
      return 0
    fi
    sleep "$HEALTH_DELAY_SECONDS"
  done
  return 1
}

log "Waiting for direct service health checks"
wait_for_url "backend" "http://127.0.0.1:8000/health" \
  || fail "backend health check failed"
wait_for_url "frontend" "http://127.0.0.1:3000/" \
  || fail "frontend health check failed"

log "Checking persistent mounts from the backend container"
# `timeout` guards against a hung exec. `docker compose exec` was observed
# hanging indefinitely against this host; without a bound it would sit until the
# workflow's 30m command_timeout killed it, giving no diagnostics at all.
#
# `</dev/null` is REQUIRED, not tidiness. `docker compose exec -T` inherits the
# caller's stdin, and when that is a terminal it blocks reading it - so this step
# appeared to hang forever when the script was run by hand over an interactive
# SSH session, while behaving fine under CI where stdin is already /dev/null.
# Detaching stdin makes the two environments behave the same.
timeout 60 "${COMPOSE[@]}" exec -T backend sh -c \
  'test -r /app/data && test -w /app/data && test -r /app/protocol_files && test -w /app/protocol_files' \
  </dev/null \
  || fail "backend cannot read and write one or more persistent data mounts (or the check timed out).
       If the host directory ownership check above passed, exec into the container and compare:
         ${COMPOSE[*]} exec -T backend sh -c 'id; ls -ld /app/data /app/protocol_files'"

# Regression guard for a live finding: /docs, /redoc and /openapi.json were
# serving 38 endpoints - 26 of them state-changing - anonymously in production.
# The controls are keyed off ENABLE_API_DOCS (default false), but a deploy that
# reintroduces them must not reach users silently.
log "Confirming the API schema is not published"
for schema_path in /docs /redoc /openapi.json; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
            "http://127.0.0.1:8000${schema_path}" || echo 000)"
  if [ "$code" = "200" ]; then
    fail "http://127.0.0.1:8000${schema_path} returned 200 - the OpenAPI surface is public.
       Set ENABLE_API_DOCS=false in /home/chematsustain/.env and redeploy."
  fi
  printf '  %s -> %s\n' "$schema_path" "$code"
done

log "Checking nginx routes end to end"
wait_for_url "nginx API route" "https://127.0.0.1/api/health" \
  -k -H "Host: database.eurskem.com" \
  || fail "nginx API route failed"
wait_for_url "nginx frontend route" "https://127.0.0.1/" \
  -k -H "Host: database.eurskem.com" \
  || fail "nginx frontend route failed"

log "Deployment completed"
"${COMPOSE[@]}" ps
