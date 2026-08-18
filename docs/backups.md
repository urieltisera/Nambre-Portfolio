# Backups

Fase 1 usa PostgreSQL para datos transaccionales y storage de objetos para PDFs/QR.

Local:

```bash
docker compose exec postgres pg_dump -U menuflow menuflow > backups/menuflow.sql
```

Producción:

- programar `pg_dump` o snapshots gestionados de PostgreSQL;
- respaldar el bucket/volumen de objetos con versionado habilitado;
- probar restauración en un entorno aislado antes de confiar en el backup;
- no incluir `.env` ni secretos dentro de los artefactos de backup versionados.

