# Restauración segura de producción

Este procedimiento está pensado para validar backups sin tocar la producción real.

## 1. Preparar entorno aislado

- Levantar una base PostgreSQL vacía en staging o en una máquina local segura.
- Crear una carpeta limpia para `STORAGE_PATH`.
- Cargar variables de entorno temporales, nunca las productivas originales.

## 2. Restaurar PostgreSQL

```bash
gzip -dc /ruta/al/backup/postgres.sql.gz | psql "postgresql://user:password@host:5432/dbname"
```

Si el backup se restaurará sobre una base temporal ya creada, verificar antes que esté vacía o descartable.

## 3. Restaurar storage

```bash
mkdir -p /tmp/nambre-storage-restore
tar -xzf /ruta/al/backup/storage.tar.gz -C /tmp/nambre-storage-restore
```

El contenido restaurado debe recrear la estructura de `STORAGE_PATH`, incluyendo `businesses/` y `qr/` si existen.

## 4. Validaciones mínimas

- Iniciar backend con la base restaurada y `STORAGE_PATH` apuntando al directorio recuperado.
- Verificar login de un usuario de prueba no productivo.
- Verificar al menos un negocio con logo, carta PDF y QR vigente.
- Abrir un redirect `/r/{public_code}` en el entorno aislado.
- Confirmar que la analítica siga respondiendo y que los archivos existan.
- Confirmar que el historial legal y de auditoría siga presente.

## 5. Criterio de aceptación

La restauración se considera válida si:

- la base abre sin errores,
- los assets críticos existen,
- el QR resuelve el destino esperado,
- el negocio mantiene acceso básico al panel,
- no hubo exposición de secretos ni uso accidental de credenciales productivas.
