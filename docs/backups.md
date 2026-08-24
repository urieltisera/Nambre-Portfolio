# Backups de producción

Nambre en Fase 1 persiste dos superficies críticas:

- PostgreSQL para datos transaccionales, legales, auditoría, invitaciones, usuarios, negocios y analítica.
- `STORAGE_PATH` para PDFs, logos, QR renderizados y otros assets persistentes.

## Objetivo operativo

Tener una copia consistente, fechada y recuperable sin introducir infraestructura extra para este piloto.

## Script recomendado

Usar `scripts/backup_production.sh` en el host o contenedor operativo que tenga acceso a:

- `pg_dump`
- la base configurada en `DATABASE_URL` o variables `PG*`
- el path real de storage configurado en `STORAGE_PATH`

Ejemplo:

```bash
BACKUP_ROOT=/var/backups/nambre \
DATABASE_URL="postgresql+psycopg://user:secret@db:5432/nambre" \
STORAGE_PATH=/data/storage \
bash scripts/backup_production.sh
```

## Qué genera

- `postgres.sql.gz`: dump lógico comprimido.
- `storage.tar.gz`: backup comprimido del volumen o carpeta de assets.
- `backup.env.example`: variables de referencia sin secretos.

Cada corrida crea una carpeta con timestamp UTC, por ejemplo `20260824T031500Z`.

## Retención

El script no borra backups viejos salvo que se configure explícitamente `BACKUP_RETENTION_DAYS`.

## Secretos y configuración

No versionar ni copiar secretos al repo. Mantener fuera del repositorio y respaldar manualmente, con acceso restringido:

- `.env.production` o equivalente
- secretos SMTP
- `SECRET_KEY`
- credenciales de base de datos
- cualquier variable de URL pública o integración externa usada en producción

## Restauración segura

La restauración debe probarse en un entorno aislado antes del piloto real. Ver `docs/restore-production.md`.
