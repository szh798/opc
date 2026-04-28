#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/backups/opc-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
COMPOSE_FILE="${COMPOSE_FILE:-/srv/opc-latest/backend/docker-compose.yml}"
CONTAINER_NAME="${CONTAINER_NAME:-opc-postgres}"
DB_NAME="${DB_NAME:-opc}"
DB_USER="${DB_USER:-postgres}"
TIMESTAMP="$(date +%F-%H%M%S)"
OUT_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

sudo docker exec "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" \
  | gzip > "${OUT_FILE}"

find "${BACKUP_DIR}" -type f -name '*.sql.gz' -mtime +"${RETENTION_DAYS}" -delete

echo "backup written to ${OUT_FILE}"
