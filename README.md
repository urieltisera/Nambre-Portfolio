# Nambre

Nambre is a multi-tenant SaaS project for businesses to manage a permanent QR presence and publish digital menus without replacing the physical QR whenever menu content changes.

The current engineering snapshot combines a FastAPI backend, Next.js frontend, PostgreSQL persistence, Alembic migrations, authentication and permissions, QR routing, digital-menu lifecycle, storage, audit-oriented controls, and Docker-based deployment.

Nambre is an active product project. This repository demonstrates implemented foundations and operational engineering; it is not presented as a finished restaurant operating system.

## What it demonstrates

- Full-stack SaaS development with FastAPI, Next.js, PostgreSQL, and Docker.
- Multi-tenant business and user boundaries.
- Authentication, session/access controls, roles, and permissions.
- Permanent public QR codes decoupled from replaceable destinations.
- Stable public menu routes that avoid exposing storage keys or internal IDs.
- PDF menu upload, replacement, rollback, and persistent storage.
- Structured digital-menu foundations with categories/items, images, themes, draft/publish snapshots, and business identity assets.
- Plan/entitlement foundations for product capability control.
- Audit and scan-event retention boundaries.
- Generic SMTP-based password reset and invitation flows.
- Legal/security routes and operational policy documentation.
- Explicit Alembic migration workflow separated from application startup.
- PostgreSQL and storage backup/restore procedures for deployment operations.

## Architecture

```text
Customer
   │
   ├── scans permanent QR
   │       │
   │       ▼
   │   public QR route
   │       │
   │       ▼
   │   active menu destination
   │
Business user
   │
   ▼
Next.js frontend
   │
   ▼
FastAPI backend
   │
   ├── authentication / permissions
   ├── business + QR management
   ├── digital menu lifecycle
   ├── storage boundary
   ├── scan / audit evidence
   └── PostgreSQL via SQLAlchemy / Alembic
```

The physical QR is intended to remain stable while the destination and published menu state can evolve behind it.

## QR and public routing

A QR uses an opaque public code rather than exposing database identifiers or storage keys.

The public redirect records scan activity and resolves the currently authorized destination. Menu content can therefore be replaced or rolled back without requiring a new physical QR.

This separation between **QR identity** and **content destination** is one of the central product boundaries in Nambre.

## Digital menu lifecycle

The repository contains the evolution from the initial PDF-menu MVP toward a structured digital-menu model.

Alembic migrations include foundations for:

- digital menus,
- business plan entitlements,
- menu-item images,
- menu themes,
- draft/publish snapshots,
- business identity logos.

This allows menu editing and publication state to evolve independently from the permanent QR layer.

## Authentication and authorization

The backend includes authentication and permission boundaries for platform and business operations.

Password recovery and invitation delivery use a generic SMTP configuration. Public recovery behavior is designed not to reveal whether a submitted account exists.

Development seed data may be created locally through repository scripts, but production credentials and administrative passwords are not part of the repository configuration.

## Storage

The current backend uses persistent local storage through a Docker volume for menu PDFs, images, logos, and generated assets.

An object-storage service may appear in development infrastructure, but the current backend storage path remains an explicit implementation boundary rather than being represented as an already completed object-storage migration.

## Database and migrations

Nambre uses PostgreSQL with Alembic migrations.

Production startup and schema migration are deliberately separated: application containers do not silently migrate the database during normal startup. Migration is an explicit operational step.

That boundary makes deployment, backup, rollback, and schema changes easier to reason about.

## Deployment

The repository includes Docker configuration for a PostgreSQL service, FastAPI backend, Next.js frontend, persistent backend storage, and an explicit one-shot migration service.

The current deployment documentation reflects a VPS-oriented topology with the application services bound behind a reverse proxy rather than presenting the backend database directly to the public internet.

Production environment files are excluded from Git. `.env.production.example` contains placeholders only and documents the expected configuration surface.

## Backup and recovery

Operational documentation covers PostgreSQL and storage backups plus restoration procedures.

Backups are treated as part of schema-change operations rather than as an afterthought, especially before migrations affecting persisted menu/business state.

## Legal and security foundations

The project includes a Legal & Security Gate and public policy surfaces for terms, privacy, acceptable use, cookies/analytics, and AI policy.

Security-related implementation decisions include bounded uploads, non-enumerating password recovery behavior, rate-limit configuration, permission checks, opaque public identifiers, explicit production secrets, and separation between migrations and normal startup.

## Technology

### Backend

- Python
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL
- Pydantic

### Frontend

- Next.js
- TypeScript
- React

### Operations

- Docker / Docker Compose
- PostgreSQL 16
- persistent storage volumes
- reverse-proxy deployment boundary
- SMTP integration boundary

## Local development

```bash
cp .env.example .env
docker compose up --build
```

Apply database migrations explicitly:

```bash
docker compose exec backend alembic upgrade head
```

Development/test seed data can then be created with the repository seed tooling.

## Validation commands

Backend quality gates documented by the project:

```bash
cd backend
ruff check .
ruff format --check .
mypy .
pytest
```

Frontend gates:

```bash
cd frontend
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

This portfolio README update does not claim those commands were rerun as part of the documentation change.

## Current boundaries

Nambre is still under active development. This snapshot should not be interpreted as implementing every planned hospitality capability.

Not represented here as completed production capabilities:

- ordering and KDS workflows,
- payment processing,
- reservations,
- WhatsApp operations,
- POS integration,
- inventory operations,
- automated AI/OCR workflows,
- the broader long-term restaurant operating platform.

The repository instead demonstrates the product foundation: identity and access, permanent QR infrastructure, menu publication, entitlements, storage, migrations, operational recovery, and a full-stack deployment boundary.

## Repository hygiene

Real production secrets belong outside Git. Local and production environment files, runtime storage, local databases, dependency directories, and generated build artifacts are excluded through `.gitignore`.

Nambre is an independent technical and product project focused on turning a permanent physical QR into a safely evolvable digital surface for businesses.
