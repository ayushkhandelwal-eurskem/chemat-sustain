#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:-$(pwd)}"

if [[ ! -f "$ROOT/docker-compose.yml" || ! -d "$ROOT/backend" || ! -d "$ROOT/frontend" ]]; then
  echo "Run from the chemat-sustain repository root, or pass its path:" >&2
  echo "  bash install.sh /path/to/chemat-sustain" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="$ROOT/.backups/api-access-console-$STAMP"
mkdir -p "$BACKUP/backend/api" "$BACKUP/frontend/src/app/backoffice"

for path in \
  backend/app.py \
  backend/api/router_phase1.py \
  frontend/src/app/backoffice/layout.tsx; do
  if [[ -f "$ROOT/$path" ]]; then
    mkdir -p "$BACKUP/$(dirname "$path")"
    cp "$ROOT/$path" "$BACKUP/$path"
  fi
done

install -D -m 0644 "$SCRIPT_DIR/backend/app.py" "$ROOT/backend/app.py"
install -D -m 0644 "$SCRIPT_DIR/backend/api/router_phase1.py" "$ROOT/backend/api/router_phase1.py"
install -D -m 0644 "$SCRIPT_DIR/backend/api/router_access_admin.py" "$ROOT/backend/api/router_access_admin.py"
install -D -m 0644 "$SCRIPT_DIR/frontend/src/app/backoffice/layout.tsx" "$ROOT/frontend/src/app/backoffice/layout.tsx"
install -D -m 0644 "$SCRIPT_DIR/frontend/src/app/backoffice/api-access/page.tsx" "$ROOT/frontend/src/app/backoffice/api-access/page.tsx"

python3 -m py_compile \
  "$ROOT/backend/app.py" \
  "$ROOT/backend/api/router_phase1.py" \
  "$ROOT/backend/api/router_access_admin.py"

echo ""
echo "API Access console installed."
echo "Backup: $BACKUP"
echo ""
echo "Next steps:"
echo "  cd $ROOT"
echo "  docker compose up -d --build --no-deps backend frontend"
echo "  docker compose up -d --force-recreate --no-deps nginx"
echo ""
echo "Open: https://database.eurskem.com/backoffice/api-access"
