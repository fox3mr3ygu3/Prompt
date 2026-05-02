#!/usr/bin/env bash
# quick-conf.app — deploy to the DigitalOcean droplet.
#
# What it does:
#   1. rsync the source tree to the droplet (excluding local artefacts).
#   2. ship .env.prod separately as the droplet's .env.
#   3. ssh in and `docker compose -f docker-compose.prod.yml up -d --build`.
#   4. apply Alembic migrations and seed.
#
# Prereqs (only the user can do these):
#   - SSH key on this box authorised on the droplet (~/.ssh/id_ed25519).
#   - Docker + compose plugin installed on the droplet.
#   - rsync available locally and on the droplet.
#
# Usage:
#   ops/deploy.sh                  # full deploy (build + migrate)
#   ops/deploy.sh --no-build       # skip rebuild, just up -d
#   ops/deploy.sh --logs           # tail logs after deploy

set -euo pipefail

DROPLET="${DROPLET:-root@167.71.36.92}"
REMOTE_DIR="${REMOTE_DIR:-/srv/quick-conf}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "fatal: ${ENV_FILE} not found in ${REPO_ROOT}" >&2
  exit 1
fi
if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "fatal: ${COMPOSE_FILE} not found in ${REPO_ROOT}" >&2
  exit 1
fi

build=1
tail_logs=0
for arg in "$@"; do
  case "$arg" in
    --no-build) build=0 ;;
    --logs)     tail_logs=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

echo "==> Ensuring remote directory exists"
ssh "${DROPLET}" "mkdir -p '${REMOTE_DIR}'"

echo "==> Syncing source to ${DROPLET}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude '.git/' \
  --exclude '.claude/' \
  --exclude 'node_modules/' \
  --exclude '.venv/' \
  --exclude 'venv/' \
  --exclude 'frontend/dist/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '.pytest_cache/' \
  --exclude '.mypy_cache/' \
  --exclude '.ruff_cache/' \
  --exclude '*-data/' \
  --exclude '.env' \
  --exclude '.env.prod' \
  --exclude 'backend/quick_conf_backend.egg-info/' \
  ./ "${DROPLET}:${REMOTE_DIR}/"

echo "==> Shipping ${ENV_FILE} as remote .env"
scp -q "${ENV_FILE}" "${DROPLET}:${REMOTE_DIR}/.env"
ssh "${DROPLET}" "chmod 600 '${REMOTE_DIR}/.env'"

if [[ $build -eq 1 ]]; then
  echo "==> Building images and bringing the stack up"
  ssh "${DROPLET}" "cd '${REMOTE_DIR}' && docker compose -f '${COMPOSE_FILE}' up -d --build --remove-orphans"
else
  echo "==> Bringing the stack up (no rebuild)"
  ssh "${DROPLET}" "cd '${REMOTE_DIR}' && docker compose -f '${COMPOSE_FILE}' up -d --remove-orphans"
fi

echo "==> Waiting for backend1 to be healthy"
ssh "${DROPLET}" "cd '${REMOTE_DIR}' && for i in \$(seq 1 60); do
  status=\$(docker compose -f '${COMPOSE_FILE}' ps --format '{{.Service}} {{.Health}}' | awk '\$1==\"backend1\" {print \$2}')
  if [[ \"\$status\" == \"healthy\" ]]; then echo backend1 healthy; exit 0; fi
  sleep 2
done
echo 'backend1 did not become healthy in 120s'; exit 1"

echo "==> Applying Alembic migrations"
ssh "${DROPLET}" "cd '${REMOTE_DIR}' && docker compose -f '${COMPOSE_FILE}' exec -T backend1 alembic upgrade head"

echo "==> Seeding demo data (idempotent — safe to re-run)"
ssh "${DROPLET}" "cd '${REMOTE_DIR}' && docker compose -f '${COMPOSE_FILE}' exec -T backend1 python -m app.seed || echo 'seed step returned non-zero (probably already seeded)'"

echo "==> Service status"
ssh "${DROPLET}" "cd '${REMOTE_DIR}' && docker compose -f '${COMPOSE_FILE}' ps"

echo
echo "Deploy complete."
echo "  http://quick-conf.app/      (once DNS resolves)"
echo "  http://167.71.36.92/         (direct IP, works now)"

if [[ $tail_logs -eq 1 ]]; then
  echo "==> Tailing logs (Ctrl-C to stop)"
  ssh "${DROPLET}" "cd '${REMOTE_DIR}' && docker compose -f '${COMPOSE_FILE}' logs -f --tail=100"
fi
