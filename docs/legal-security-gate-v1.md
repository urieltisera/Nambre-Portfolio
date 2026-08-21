# Nambre Legal & Security Gate v1

Fecha de auditoría técnica: 2026-08-21

## IMPLEMENTADO

- Consentimiento legal versionado por usuario con historial durable en `legal_acceptances`.
- Fuente explícita de versiones legales vigentes en `backend/app/legal.py`.
- Detección de aceptación pendiente y gate backend sobre endpoints autenticados sensibles.
- Endpoints operables para completar aceptación y cerrar sesión:
  - `GET /api/legal/status`
  - `POST /api/legal/accept`
  - `POST /auth/logout`
- Roles de negocio centralizados con mínimo privilegio:
  - `owner`
  - `manager`
  - `staff`
- Autorización centralizada por permisos de negocio en `backend/app/auth/permissions.py`.
- Sesiones revocables en servidor mediante `user_sessions`.
- Logout con revocación real de sesión.
- Bloqueo de sesiones revocadas e invalidadas.
- Auditoría persistente en `audit_events` para:
  - login exitoso
  - login fallido
  - logout
  - aceptación legal
  - asignación de memberships
  - cambios administrativos de negocio/estado
- Gate legal mínimo en frontend para detectar aceptación pendiente y destrabar la cuenta sin acceso accidental al resto de la app.
- Configuración explícita de retención:
  - `SCAN_EVENT_RETENTION_DAYS`
  - `AUDIT_EVENT_RETENTION_DAYS`

## VERIFICADO

- Password hashing no reversible con `bcrypt`; no se almacenan contraseñas en texto plano.
- JWT firmados con `HS256` usando `SECRET_KEY`.
- `GET /r/{public_code}` y `GET /m/{public_code}/menu.pdf` siguen usando URLs públicas estables y `Cache-Control: no-store`.
- Los redirects públicos sólo resuelven el flujo de `menu_pdf`; destinos no soportados como `external_url` quedan rechazados.
- El frontend no persiste el bearer token en `localStorage`; hoy vive en estado React.
- Multi-tenant isolation validado por tests para lectura/escritura y descarga de assets QR.
- Platform admin no implica bypass del gate legal; primero debe aceptar documentos vigentes.
- El rol `staff` puede ver pero no mutar recursos sensibles.
- No se detectó integración activa de IA en backend ni frontend de esta fase.
- No se detectó generación de QR artístico activa; el enum existe, pero no hay flujo productivo que lo emita.

## TESTS DE SEGURIDAD

- `test_legal_acceptance_is_versioned_and_historical`
- `test_logout_revokes_login_session_and_audits_it`
- `test_staff_can_view_but_cannot_mutate_sensitive_resources`
- `test_cross_tenant_qr_asset_download_is_forbidden`
- `test_public_redirect_rejects_unsupported_dangerous_destination`
- `test_legal_gate_blocks_admin_endpoints_but_keeps_accept_and_logout_available`
- `test_qr_generation_does_not_create_artistic_records_without_real_validation`

Además siguen pasando los tests previos de:

- auth/login y usuarios inactivos
- owner/admin separation
- cross-tenant access
- QR payload/downloads
- redirects públicos
- analytics básicos
- suspensión/reactivación

## SECRETOS Y CREDENCIALES

- No se encontraron secretos reales expuestos de forma evidente en el árbol auditado.
- `.env.example` y `compose.yaml` mantienen valores de ejemplo/dev; no deben reutilizarse fuera de local.
- No se imprimen tokens completos ni contraseñas desde la lógica nueva implementada.
- Queda recomendado rotar cualquier credencial real que haya sido reutilizada fuera de este repo, aunque no se observó evidencia explícita en Git de exposición accidental.

## ANALYTICS Y MINIMIZACIÓN

- Hoy se registran:
  - `business_id`
  - `dynamic_link_id`
  - timestamp
  - categoría resumida de user agent
- No se almacenan IPs, emails ni identificadores personales en `scan_events`.
- La arquitectura actual no distingue todavía entre:
  - QR
  - NFC
  - acceso directo
- La retención quedó parametrizable por configuración, pero no existe todavía un job de purga automática.

## IA

- No hay proveedor de IA activo integrado en esta fase del producto.
- No se implementó arquitectura ficticia de IA.
- Si en el futuro se agrega QR artístico u otra generación asistida, deberá validarse determinísticamente su salida antes de declararla apta.

## DEPENDENCIAS Y LICENCIAS

Inventario directo backend desde metadata local:

- `alembic` `1.19.1` licencia no clara en metadata local; revisar manualmente.
- `bcrypt` `5.0.0` `Apache-2.0`
- `email-validator` `2.3.0` `Unlicense`
- `fastapi` `0.141.1` licencia no clara en metadata local; revisar manualmente.
- `httpx` `0.28.1` `BSD-3-Clause`
- `pillow` `12.3.0` licencia no clara en metadata local; revisar manualmente.
- `psycopg` `3.3.4` licencia no clara en metadata local; revisar manualmente.
- `pydantic-settings` `2.15.0` licencia no clara en metadata local; revisar manualmente.
- `PyJWT` `2.13.0` licencia no clara en metadata local; revisar manualmente.
- `python-multipart` `0.0.32` licencia no clara en metadata local; revisar manualmente.
- `qrcode` `8.2` `BSD`
- `SQLAlchemy` `2.0.52` `MIT`
- `uvicorn` `0.52.3` licencia no clara en metadata local; revisar manualmente.

Inventario directo frontend desde metadata local:

- `lucide-react` `0.468.0` `ISC`
- `next` `15.5.23` `MIT`
- `react` `19.2.8` `MIT`
- `react-dom` `19.2.8` `MIT`
- `react-is` `19.2.8` `MIT`
- `recharts` `3.10.1` `MIT`
- `@testing-library/react` `16.3.2` `MIT`
- `eslint` `9.39.5` `MIT`
- `eslint-config-next` `15.5.23` `MIT`
- `jsdom` `30.0.1` `MIT`
- `typescript` `5.9.3` `Apache-2.0`
- `vitest` `2.1.9` `MIT`

No se detectaron licencias GPL/AGPL fuertes en las dependencias directas relevadas por metadata local. Queda pendiente revisión transitive y de assets externos.

## PENDIENTE

- Política legal diferenciada por `business_id` si en el futuro hay documentos específicos por negocio.
- Revocación masiva de sesiones ante eventos como cambio de password, deactivación manual o incidente de seguridad.
- Endpoint y flujo formal de cambio de roles más allá de la asignación actual de owner/membership.
- Exportación de datos, cierre de cuenta/business y borrado seguro con workflow explícito.
- Purga automática basada en `SCAN_EVENT_RETENTION_DAYS` y `AUDIT_EVENT_RETENTION_DAYS`.
- Revisión completa de licencias transitivas, assets, tipografías e íconos de terceros.
- Headers HTTP adicionales de hardening si el despliegue final incorpora reverse proxy o edge config propia.
- Validación técnica de QR artístico cuando exista una implementación real de esa funcionalidad.
- Distinción analítica entre QR, NFC y acceso directo si la arquitectura futura lo necesita.

## FUERA DE ALCANCE

- Microservicios o rediseño de arquitectura.
- Nuevos proveedores de IA.
- Pagos, NFC productivo, cloud ficticia o cambios visuales ajenos al gate.
- Rotación automática de secretos externos sin evidencia concreta de exposición en este repo.

## RIESGOS RESIDUALES

- Compatibilidad temporal con tokens legacy sin `sid` para no romper el helper histórico de tests; la emisión normal vía login ya usa sesiones revocables.
- No existe refresh token; la estrategia actual sigue siendo access token con expiración y sesión revocable.
- El sistema de auditoría persiste eventos clave, pero aún no expone tooling de consulta o exportación.
