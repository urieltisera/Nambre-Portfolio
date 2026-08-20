# MenuFlow

MVP Fase 1: un QR permanente para un negocio, PDF de carta reemplazable, rollback, QR estándar/branded y estadísticas básicas.

## Local

```bash
cp .env.example .env
docker compose up --build
```

En otra terminal:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python ../scripts/seed.py
```

Backend: `http://localhost:8000`
Frontend: `http://localhost:3000`

Credenciales de seed:

- Platform admin: `admin@example.com` / `admin12345`
- Owner Bar Central: `owner@example.com` / `owner12345`

Estas credenciales existen solo para desarrollo local, seed y tests. No deben usarse en produccion.

## Admin real de operacion

Para crear un platform admin real, usar el script administrativo. Reutiliza el mismo hash de password del backend, valida email, no imprime la password y no promueve usuarios existentes a admin salvo que se pida explicitamente.

Interactivo dentro del contenedor backend:

```bash
docker compose run --rm -it \
  -v "${PWD}/scripts/create_admin.py:/app/create_admin.py" \
  backend python /app/create_admin.py
```

No interactivo usando variables de entorno temporales:

```bash
ADMIN_EMAIL="ops@example.com" ADMIN_PASSWORD="replace-with-a-strong-password" \
docker compose run --rm \
  -v "${PWD}/scripts/create_admin.py:/app/create_admin.py" \
  -e ADMIN_EMAIL \
  -e ADMIN_PASSWORD \
  backend python /app/create_admin.py
```

Si el usuario ya existe pero no es platform admin, el script falla de forma segura. Para promoverlo explicitamente y reemplazar su password hash:

```bash
ADMIN_EMAIL="ops@example.com" ADMIN_PASSWORD="replace-with-a-strong-password" \
docker compose run --rm \
  -v "${PWD}/scripts/create_admin.py:/app/create_admin.py" \
  -e ADMIN_EMAIL \
  -e ADMIN_PASSWORD \
  backend python /app/create_admin.py --promote-existing
```

## Gates

Backend:

```bash
cd backend
ruff check .
ruff format --check .
mypy .
pytest
alembic upgrade head
```

Frontend:

```bash
cd frontend
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

## Redirect público

`GET /r/{public_code}` usa `302 Found`. La ruta registra el scan y redirige a `/m/{public_code}/menu.pdf`, una URL pública estable que no expone storage keys ni IDs internos.

## Storage actual

Fase 1 Base sigue usando `LocalStorage` en backend. En `compose.yaml`, el backend persiste archivos en el volumen Docker `backend_storage` montado en `/data/storage`, por lo que PDFs, logos y QR sobreviven a reinicios del contenedor.

MinIO figura en Compose, pero hoy no está integrado en el backend. Se mantiene como deuda técnica explícita; no forma parte de este cierre de Fase 1.

## Alcance excluido

No incluye pedidos, pagos, reservas, WhatsApp, IA, OCR, menú digital estructurado, productos, inventario, POS, promociones, landing pages ni QR artístico automático.

