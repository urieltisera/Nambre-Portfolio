from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from os import PathLike
from pathlib import Path
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, File, Header, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import record_audit_event
from app.auth.permissions import (
    BusinessPermission,
    require_business_permission,
    require_membership,
    require_operable_business,
    require_platform_admin,
)
from app.auth.security import (
    AuthContext,
    create_access_token,
    create_user_session,
    get_current_auth,
    get_current_user,
    hash_password,
    verify_password,
)
from app.config import get_settings
from app.db import get_db
from app.legal import CURRENT_LEGAL_VERSIONS
from app.models import (
    AcceptanceMethod,
    Business,
    BusinessStatus,
    DestinationType,
    DynamicLink,
    LegalAcceptance,
    LegalDocumentType,
    Membership,
    MenuAsset,
    QRCode,
    User,
)
from app.schemas import (
    AnalyticsSummaryOut,
    BusinessCreate,
    BusinessOut,
    BusinessPatch,
    DailyScanOut,
    LegalAcceptIn,
    LegalDocumentStatusOut,
    LegalStatusOut,
    LoginIn,
    MenuAssetOut,
    MenuStateOut,
    OwnerAssignIn,
    QRCodeOut,
    RollbackIn,
    TokenOut,
    UserOut,
)
from app.services.analytics_service import daily_series, record_scan, summary
from app.services.legal_service import (
    accept_legal_documents,
    latest_legal_acceptances,
    pending_legal_documents,
)
from app.services.menu_service import get_active_menu, rollback_menu, upload_menu_pdf
from app.services.qr_service import generate_qr_assets
from app.services.user_admin_service import normalize_email
from app.storage.local import LocalStorage

router = APIRouter()
_login_attempts: dict[str, deque[datetime]] = defaultdict(deque)
LOGO_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg"}


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    _check_login_rate(payload.email)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        record_audit_event(
            db,
            event_type="auth.login_failed",
            target_type="user_email",
            target_id=payload.email.lower(),
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    pending = pending_legal_documents(db, user)
    if pending:
        if not payload.accept_legal:
            legal_status = _legal_status_payload(db, user)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "legal_acceptance_required",
                    "legal_status": legal_status.model_dump(mode="json"),
                    "message": "Legal acceptance required",
                },
            )
        created = accept_legal_documents(
            db,
            user=user,
            acceptance_method=AcceptanceMethod.ui_checkbox,
        )
        _record_legal_acceptance_events(db, user.id, created)
    session = create_user_session(db, user)
    record_audit_event(db, event_type="auth.login_succeeded", actor_user_id=user.id)
    db.commit()
    return TokenOut(access_token=create_access_token(user, session))


@router.post("/auth/logout", status_code=204)
def logout(
    auth: AuthContext = Depends(get_current_auth), db: Session = Depends(get_db)
) -> Response:
    if auth.session is not None and auth.session.revoked_at is None:
        auth.session.revoked_at = datetime.now(UTC)
        auth.session.revoke_reason = "logout"
        record_audit_event(
            db,
            event_type="auth.logout",
            actor_user_id=auth.user.id,
            target_type="session",
            target_id=auth.session.id,
        )
        db.commit()
    return Response(status_code=204)


@router.get("/api/me", response_model=UserOut)
def me(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> User:
    _enforce_legal_acceptance(db, user)
    return user


@router.get("/api/legal/status", response_model=LegalStatusOut)
def legal_status(
    business_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LegalStatusOut:
    if business_id is not None:
        require_membership(db, user, business_id)
    return _legal_status_payload(db, user, business_id)


@router.post("/api/legal/accept", response_model=LegalStatusOut)
def accept_legal(
    payload: LegalAcceptIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LegalStatusOut:
    if payload.business_id is not None:
        require_membership(db, user, payload.business_id)
    created = accept_legal_documents(
        db,
        user=user,
        acceptance_method=payload.acceptance_method,
        business_id=payload.business_id,
        document_types=payload.document_types,
    )
    _record_legal_acceptance_events(db, user.id, created)
    db.commit()
    return _legal_status_payload(db, user, payload.business_id)


@router.get("/api/me/businesses", response_model=list[BusinessOut])
def my_businesses(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Business]:
    _enforce_legal_acceptance(db, user)
    if user.is_platform_admin:
        return _list_all_businesses(db)
    return list(
        db.scalars(
            select(Business)
            .join(Membership, Membership.business_id == Business.id)
            .where(Membership.user_id == user.id)
            .order_by(Business.name)
        ).all()
    )


@router.get("/api/businesses/{business_id}", response_model=BusinessOut)
def get_business(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Business:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_business)
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


@router.patch("/api/businesses/{business_id}", response_model=BusinessOut)
def patch_business(
    business_id: str,
    payload: BusinessPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Business:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.edit_business)
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    data = payload.model_dump(exclude_unset=True)
    if not user.is_platform_admin:
        data.pop("status", None)
        if data:
            business = require_operable_business(db, user, business_id)
    for key, value in data.items():
        setattr(business, key, value)
    business.updated_at = datetime.now(UTC)
    db.commit()
    return business


@router.post("/api/businesses/{business_id}/logo", response_model=BusinessOut)
async def upload_logo(
    business_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Business:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_logo)
    business = require_operable_business(db, user, business_id)
    suffix = LOGO_TYPES.get(file.content_type or "")
    if suffix is None:
        raise HTTPException(status_code=400, detail="Only PNG or JPEG logos are allowed")
    storage = LocalStorage()
    key = storage.logo_key(business_id, suffix)
    size = await storage.save_upload(file, key)
    if size == 0:
        storage.open(key).unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Logo file is empty")
    if size > 2 * 1024 * 1024:
        storage.open(key).unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="Logo too large")
    _delete_existing_logo_files(business_id, keep=storage.open(key))
    business.logo_url = f"/logos/{business.id}"
    business.updated_at = datetime.now(UTC)
    db.commit()
    return business


@router.get("/logos/{business_id}", response_model=None)
def public_logo(business_id: str, db: Session = Depends(get_db)) -> FileResponse:
    business = db.get(Business, business_id)
    if business is None or business.status == BusinessStatus.suspended:
        raise HTTPException(status_code=404, detail="Not found")
    root = Path(get_settings().storage_path) / "businesses" / business_id / "logo"
    for candidate in root.glob("logo.*"):
        if candidate.suffix.lower() in {".png", ".jpg", ".jpeg"}:
            return FileResponse(candidate, headers={"Cache-Control": "no-store"})
    raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/businesses/{business_id}/menu", response_model=MenuStateOut)
def menu_state(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> MenuStateOut:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_business)
    versions = db.scalars(
        select(MenuAsset)
        .where(MenuAsset.business_id == business_id)
        .order_by(MenuAsset.version.desc())
    ).all()
    current = get_active_menu(db, business_id)
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business_id))
    current_out = MenuAssetOut.model_validate(current) if current is not None else None
    versions_out = [MenuAssetOut.model_validate(asset) for asset in versions]
    return MenuStateOut(
        current=current_out,
        versions=versions_out,
        public_code=link.public_code if link else None,
    )


@router.post("/api/businesses/{business_id}/menu", response_model=MenuStateOut)
@router.post("/api/businesses/{business_id}/menu/replace", response_model=MenuStateOut)
async def replace_menu(
    business_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MenuStateOut:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_menu)
    await upload_menu_pdf(db, business_id, user, file)
    db.commit()
    return menu_state(business_id, db, user)


@router.post("/api/businesses/{business_id}/menu/rollback", response_model=MenuStateOut)
def rollback(
    business_id: str,
    payload: RollbackIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MenuStateOut:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.rollback_menu)
    rollback_menu(db, business_id, payload.menu_asset_id)
    db.commit()
    return menu_state(business_id, db, user)


@router.get("/api/businesses/{business_id}/qr", response_model=list[QRCodeOut])
def list_qr(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[QRCode]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_qr)
    return list(db.scalars(select(QRCode).where(QRCode.business_id == business_id)).all())


@router.post("/api/businesses/{business_id}/qr/generate", response_model=list[QRCodeOut])
def generate_qr(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[QRCode]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.manage_qr)
    created = generate_qr_assets(db, business_id)
    db.commit()
    return created


@router.get("/api/businesses/{business_id}/qr-assets/{filename}")
def download_qr(
    business_id: str,
    filename: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FileResponse:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_qr)
    if filename not in {"standard.png", "standard.svg", "branded.png", "branded.svg"}:
        raise HTTPException(status_code=404, detail="QR not found")
    path = Path(get_settings().storage_path) / "qr" / business_id / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="QR not found")
    return FileResponse(path, headers=_dynamic_public_cache_headers())


@router.get("/api/businesses/{business_id}/analytics/summary", response_model=AnalyticsSummaryOut)
def analytics_summary(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, int | None]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_analytics)
    return summary(db, business_id)


@router.get("/api/businesses/{business_id}/analytics/scans", response_model=list[DailyScanOut])
def analytics_scans(
    business_id: str,
    period: str = "30d",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, str | int]]:
    _enforce_legal_acceptance(db, user, business_id)
    require_business_permission(db, user, business_id, BusinessPermission.view_analytics)
    if period not in {"1d", "7d", "30d"}:
        raise HTTPException(status_code=400, detail="Unsupported period")
    return daily_series(db, business_id, period)


@router.get("/r/{public_code}", response_model=None)
def public_redirect(
    public_code: str, user_agent: str | None = Header(default=None), db: Session = Depends(get_db)
) -> RedirectResponse | PlainTextResponse:
    link = db.scalar(select(DynamicLink).where(DynamicLink.public_code == public_code))
    if link is None:
        raise HTTPException(status_code=404, detail="Not found")
    business = db.get(Business, link.business_id)
    if (
        business is None
        or not link.is_active
        or business.status not in {BusinessStatus.active, BusinessStatus.demo}
    ):
        return PlainTextResponse(
            "Este menú no se encuentra disponible actualmente.", status_code=403
        )
    if link.destination_type != DestinationType.menu_pdf:
        raise HTTPException(status_code=404, detail="Not found")
    record_scan(db, link.id, link.business_id, user_agent)
    db.commit()
    return RedirectResponse(
        url=_public_menu_url(public_code, link.destination_id),
        status_code=302,
        headers=_dynamic_public_cache_headers(),
    )


@router.get("/m/{public_code}/menu.pdf", response_model=None)
def public_menu_file(
    public_code: str, v: str | None = None, db: Session = Depends(get_db)
) -> FileResponse | PlainTextResponse:
    del v
    link = db.scalar(select(DynamicLink).where(DynamicLink.public_code == public_code))
    if link is None:
        raise HTTPException(status_code=404, detail="Not found")
    business = db.get(Business, link.business_id)
    if (
        business is None
        or not link.is_active
        or business.status not in {BusinessStatus.active, BusinessStatus.demo}
    ):
        return PlainTextResponse(
            "Este menú no se encuentra disponible actualmente.", status_code=403
        )
    asset = db.get(MenuAsset, link.destination_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        path = LocalStorage().open(asset.storage_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={
            **_dynamic_public_cache_headers(),
            "Content-Type": "application/pdf",
            "Content-Disposition": _inline_content_disposition(asset.original_filename),
        },
    )


@router.get("/admin/businesses", response_model=list[BusinessOut])
def admin_businesses(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Business]:
    _enforce_legal_acceptance(db, user)
    require_platform_admin(user)
    return _list_all_businesses(db)


@router.post("/admin/businesses", response_model=BusinessOut)
def admin_create_business(
    payload: BusinessCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Business:
    _enforce_legal_acceptance(db, user)
    require_platform_admin(user)
    business = Business(**payload.model_dump())
    db.add(business)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "slug" in str(exc).lower():
            raise HTTPException(status_code=400, detail="Slug already exists") from exc
        raise
    return business


@router.patch("/admin/businesses/{business_id}", response_model=BusinessOut)
def admin_patch_business(
    business_id: str,
    payload: BusinessPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Business:
    _enforce_legal_acceptance(db, user)
    require_platform_admin(user)
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(business, key, value)
    business.updated_at = datetime.now(UTC)
    record_audit_event(
        db,
        event_type="business.status_changed" if payload.status is not None else "business.updated",
        actor_user_id=user.id,
        business_id=business.id,
        target_type="business",
        target_id=business.id,
        details=payload.model_dump(exclude_unset=True),
    )
    db.commit()
    return business


@router.post("/admin/businesses/{business_id}/owner", response_model=UserOut)
def admin_assign_owner(
    business_id: str,
    payload: OwnerAssignIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    _enforce_legal_acceptance(db, user)
    require_platform_admin(user)
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    normalized_email = normalize_email(payload.email)
    owner = db.scalar(select(User).where(User.email == normalized_email))
    if owner is None:
        owner = User(email=normalized_email, password_hash=hash_password(payload.password))
        db.add(owner)
        db.flush()
    elif not verify_password(payload.password, owner.password_hash):
        raise HTTPException(
            status_code=409,
            detail="User email already exists with a different password",
        )
    if not db.scalar(
        select(Membership).where(
            Membership.user_id == owner.id, Membership.business_id == business_id
        )
    ):
        db.add(Membership(user_id=owner.id, business_id=business_id, role=payload.role))
    record_audit_event(
        db,
        event_type="membership.assigned",
        actor_user_id=user.id,
        business_id=business.id,
        target_type="user",
        target_id=owner.id,
        details={"email": owner.email, "role": payload.role.value},
    )
    db.commit()
    return owner


def _check_login_rate(email: str) -> None:
    settings = get_settings()
    now = datetime.now(UTC)
    bucket = _login_attempts[email.lower()]
    while bucket and bucket[0] < now - timedelta(minutes=1):
        bucket.popleft()
    if len(bucket) >= settings.login_rate_limit_per_minute:
        raise HTTPException(status_code=429, detail="Too many login attempts")
    bucket.append(now)


def _delete_existing_logo_files(business_id: str, keep: Path | None = None) -> None:
    root = Path(get_settings().storage_path) / "businesses" / business_id / "logo"
    for candidate in root.glob("logo.*"):
        if candidate.suffix.lower() in {".png", ".jpg", ".jpeg"} and candidate != keep:
            candidate.unlink(missing_ok=True)


def _inline_content_disposition(filename: str | PathLike[str]) -> str:
    safe_name = Path(filename).name or "menu.pdf"
    encoded = quote(safe_name)
    return f"inline; filename=\"{safe_name}\"; filename*=UTF-8''{encoded}"


def _dynamic_public_cache_headers() -> dict[str, str]:
    return {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }


def _public_menu_url(public_code: str, destination_id: str) -> str:
    return f"/m/{public_code}/menu.pdf?{urlencode({'v': destination_id})}"


def _list_all_businesses(db: Session) -> list[Business]:
    return list(db.scalars(select(Business).order_by(Business.name, Business.id)).all())


def _record_legal_acceptance_events(
    db: Session, user_id: str, acceptances: list[LegalAcceptance]
) -> None:
    for acceptance in acceptances:
        record_audit_event(
            db,
            event_type="legal.accepted",
            actor_user_id=user_id,
            business_id=acceptance.business_id,
            target_type="legal_document",
            target_id=acceptance.document_type.value,
            details={
                "acceptance_method": acceptance.acceptance_method.value,
                "document_version": acceptance.document_version,
            },
        )


def _legal_status_payload(
    db: Session, user: User, business_id: str | None = None
) -> LegalStatusOut:
    latest = latest_legal_acceptances(db, user.id, business_id)
    pending = pending_legal_documents(db, user, business_id)
    documents = [
        _legal_document_status(document_type, current_version, latest, pending)
        for document_type, current_version in CURRENT_LEGAL_VERSIONS.items()
    ]
    return LegalStatusOut(
        documents=documents,
        pending_documents=pending,
        requires_acceptance=bool(pending),
    )


def _legal_document_status(
    document_type: LegalDocumentType,
    current_version: str,
    latest: dict[LegalDocumentType, LegalAcceptance],
    pending: list[LegalDocumentType],
) -> LegalDocumentStatusOut:
    acceptance = latest.get(document_type)
    return LegalDocumentStatusOut(
        document_type=document_type,
        current_version=current_version,
        accepted_version=acceptance.document_version if acceptance is not None else None,
        accepted_at=acceptance.accepted_at if acceptance is not None else None,
        is_current=document_type not in pending,
    )


def _enforce_legal_acceptance(db: Session, user: User, business_id: str | None = None) -> None:
    pending = pending_legal_documents(db, user, business_id)
    if pending:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Legal acceptance required",
        )
