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

- Platform admin: `admin@menuflow.local` / `admin12345`
- Owner Bar Central: `owner@barcentral.local` / `owner12345`

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

## Alcance excluido

No incluye pedidos, pagos, reservas, WhatsApp, IA, OCR, menú digital estructurado, productos, inventario, POS, promociones, landing pages ni QR artístico automático.

