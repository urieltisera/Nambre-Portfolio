#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_bin() {
  command -v "$1" >/dev/null 2>&1 || fail "Falta dependencia requerida: $1"
}

require_bin date
require_bin gzip
require_bin pg_dump
require_bin tar

backup_root="${BACKUP_ROOT:-./backups/production}"
storage_path="${STORAGE_PATH:-/data/storage}"
timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
target_dir="${backup_root%/}/${timestamp}"
postgres_dump="${target_dir}/postgres.sql.gz"
storage_dump="${target_dir}/storage.tar.gz"
manifest_file="${target_dir}/backup.env.example"

database_url="${DATABASE_URL:-}"
if [[ -z "$database_url" ]]; then
  if [[ -n "${PGHOST:-}" && -n "${PGDATABASE:-}" && -n "${PGUSER:-}" ]]; then
    database_url="postgresql://${PGUSER}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE}"
  elif [[ -n "${POSTGRES_HOST:-}" && -n "${POSTGRES_DB:-}" && -n "${POSTGRES_USER:-}" && -n "${POSTGRES_PASSWORD:-}" ]]; then
    database_url="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT:-5432}/${POSTGRES_DB}"
  else
    fail "Definí DATABASE_URL, PGHOST/PGDATABASE/PGUSER o POSTGRES_HOST/POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD antes de correr el backup"
  fi
fi
database_url="${database_url/+psycopg/}"

[[ -d "$storage_path" ]] || fail "STORAGE_PATH no existe o no es directorio: $storage_path"

mkdir -p "$target_dir"

printf 'Creando dump PostgreSQL en %s\n' "$postgres_dump"
pg_dump --dbname="$database_url" --format=plain --no-owner --no-privileges | gzip -9 >"$postgres_dump"

printf 'Empaquetando storage en %s\n' "$storage_dump"
tar -C "$storage_path" -czf "$storage_dump" .

cat >"$manifest_file" <<EOF
BACKUP_CREATED_AT_UTC=${timestamp}
BACKUP_ROOT=${backup_root}
STORAGE_PATH=${storage_path}
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=<postgres-database>
POSTGRES_USER=<postgres-user>
POSTGRES_PASSWORD=<postgres-password>
EOF

if [[ -n "${BACKUP_RETENTION_DAYS:-}" ]]; then
  [[ "${BACKUP_RETENTION_DAYS}" =~ ^[0-9]+$ ]] || fail "BACKUP_RETENTION_DAYS debe ser entero positivo"
  printf 'Limpiando backups con más de %s días en %s\n' "$BACKUP_RETENTION_DAYS" "$backup_root"
  find "$backup_root" -mindepth 1 -maxdepth 1 -type d -mtime "+${BACKUP_RETENTION_DAYS}" -print0 |
    while IFS= read -r -d '' old_dir; do
      rm -rf -- "$old_dir"
    done
fi

printf 'Backup completado en %s\n' "$target_dir"
printf 'Verificación recomendada: gzip -t %s && tar -tzf %s >/dev/null\n' "$postgres_dump" "$storage_dump"
