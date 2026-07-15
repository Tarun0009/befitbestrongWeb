#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_DIR/deploy/.env.production"
COMPOSE_FILE="$PROJECT_DIR/deploy/docker-compose.production.example.yml"

require_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required deployment value: $name" >&2
    exit 1
  fi
}

require_value RELEASE_SHA
require_value BACKEND_IMAGE
require_value FRONTEND_IMAGE

if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "RELEASE_SHA must be a lowercase, full 40-character Git commit SHA." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy deploy/.env.production.example and fill it on the server." >&2
  exit 1
fi

command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is required." >&2; exit 1; }
docker compose version >/dev/null

compose=(
  docker compose
  --env-file "$ENV_FILE"
  -f "$COMPOSE_FILE"
)

show_diagnostics() {
  local exit_code=$?
  trap - ERR
  echo "Deployment failed. Current service state:" >&2
  "${compose[@]}" ps >&2 || true
  "${compose[@]}" logs --tail=100 migrate backend frontend >&2 || true
  exit "$exit_code"
}
trap show_diagnostics ERR

echo "Validating production Compose configuration..."
"${compose[@]}" config --quiet

echo "Pulling immutable release images for $RELEASE_SHA..."
"${compose[@]}" pull migrate backend frontend

echo "Starting stateful services..."
"${compose[@]}" up -d --no-build postgres redis --wait --wait-timeout 180

echo "Applying database migrations once..."
"${compose[@]}" run --rm --no-deps migrate

echo "Starting application services..."
"${compose[@]}" up -d --no-build --no-deps backend frontend \
  --remove-orphans --wait --wait-timeout 180

echo "Checking application health endpoints..."
curl --fail --silent --show-error --retry 12 --retry-delay 5 \
  --retry-all-errors --max-time 5 http://127.0.0.1:4000/health/ready >/dev/null
curl --fail --silent --show-error --retry 12 --retry-delay 5 \
  --retry-all-errors --max-time 5 http://127.0.0.1:3005/health >/dev/null

trap - ERR
"${compose[@]}" ps
echo "Deployment completed successfully: $RELEASE_SHA"
