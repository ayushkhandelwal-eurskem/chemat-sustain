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
flock -n 9 || fail "another deployment is already running"

cd "$REPO_DIR"
[ -f "$COMPOSE_FILE" ] || fail "$REPO_DIR/$COMPOSE_FILE does not exist"
[ -f .env ] || fail "$REPO_DIR/.env does not exist"

log "Validating environment and Compose configuration"
required_env=(
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL
  KEYCLOAK_DB_USER KEYCLOAK_DB_PASSWORD KEYCLOAK_DB_NAME
  KEYCLOAK_ADMIN_USERNAME KEYCLOAK_ADMIN_PASSWORD
)
for name in "${required_env[@]}"; do
  grep -Eq "^[[:space:]]*${name}=.+" .env \
    || fail "required variable ${name} is missing or empty in .env"
done
"${COMPOSE[@]}" config --quiet

log "Checking persistent host directories"
for directory in \
  /home/chematsustain/protocol_files \
  /home/chematsustain/research_data; do
  [ -d "$directory" ] \
    || fail "persistent directory $directory is missing; create it with ownership suitable for the backend appuser before deploying"
done

log "Validating nginx configuration before changing running services"
docker run --rm \
  --add-host frontend:127.0.0.1 \
  --add-host backend:127.0.0.1 \
  -v "$REPO_DIR/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v /etc/ssl/certs/origin.pem:/etc/ssl/certs/origin.pem:ro \
  -v /etc/ssl/private/origin.key:/etc/ssl/private/origin.key:ro \
  "$NGINX_IMAGE" nginx -t

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
"${COMPOSE[@]}" exec -T backend sh -c \
  'test -r /app/data && test -w /app/data && test -r /app/protocol_files && test -w /app/protocol_files' \
  || fail "backend cannot read and write one or more persistent data mounts"

log "Checking nginx routes end to end"
wait_for_url "nginx API route" "https://127.0.0.1/api/health" \
  -k -H "Host: database.eurskem.com" \
  || fail "nginx API route failed"
wait_for_url "nginx frontend route" "https://127.0.0.1/" \
  -k -H "Host: database.eurskem.com" \
  || fail "nginx frontend route failed"

log "Deployment completed"
"${COMPOSE[@]}" ps
