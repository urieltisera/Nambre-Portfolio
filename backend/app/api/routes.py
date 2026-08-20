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

from app.auth.permissions import (
    require_membership,
    require_operable_business,
    require_platform_admin,
)
from app.auth.security import create_access_token, get_current_user, hash_password, verify_password
from app.config import get_settings
from app.db import get_db
from app.models import (
    Business,
    BusinessStatus,
    DestinationType,
    DynamicLink,
    Membership,
    MembershipRole,
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
    LoginIn,
    MenuStateOut,
    OwnerAssignIn,
    QRCodeOut,
    RollbackIn,
    TokenOut,
    UserOut,
)
from app.services.analytics_service import daily_series, record_scan, summary
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenOut(access_token=create_access_token(user))


@router.post("/auth/logout", status_code=204)
def logout() -> Response:
    return Response(status_code=204)


@router.get("/api/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/api/me/businesses", response_model=list[BusinessOut])
def my_businesses(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Business]:
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
    require_membership(db, user, business_id)
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
    require_membership(db, user, business_id, {MembershipRole.owner})
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
    require_membership(db, user, business_id, {MembershipRole.owner})
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
    require_membership(db, user, business_id)
    versions = db.scalars(
        select(MenuAsset)
        .where(MenuAsset.business_id == business_id)
        .order_by(MenuAsset.version.desc())
    ).all()
    current = get_active_menu(db, business_id)
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business_id))
    return MenuStateOut(
        current=current, versions=list(versions), public_code=link.public_code if link else None
    )


@router.post("/api/businesses/{business_id}/menu", response_model=MenuStateOut)
@router.post("/api/businesses/{business_id}/menu/replace", response_model=MenuStateOut)
async def replace_menu(
    business_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MenuStateOut:
    require_membership(db, user, business_id, {MembershipRole.owner, MembershipRole.manager})
    require_operable_business(db, user, business_id)
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
    require_membership(db, user, business_id, {MembershipRole.owner})
    require_operable_business(db, user, business_id)
    rollback_menu(db, business_id, payload.menu_asset_id)
    db.commit()
    return menu_state(business_id, db, user)


@router.get("/api/businesses/{business_id}/qr", response_model=list[QRCodeOut])
def list_qr(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[QRCode]:
    require_membership(db, user, business_id)
    return list(db.scalars(select(QRCode).where(QRCode.business_id == business_id)).all())


@router.post("/api/businesses/{business_id}/qr/generate", response_model=list[QRCodeOut])
def generate_qr(
    business_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[QRCode]:
    require_membership(db, user, business_id, {MembershipRole.owner, MembershipRole.manager})
    require_operable_business(db, user, business_id)
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
    require_membership(db, user, business_id)
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
    require_membership(db, user, business_id)
    return summary(db, business_id)


@router.get("/api/businesses/{business_id}/analytics/scans", response_model=list[DailyScanOut])
def analytics_scans(
    business_id: str,
    period: str = "30d",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, str | int]]:
    require_membership(db, user, business_id)
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
    require_platform_admin(user)
    return _list_all_businesses(db)


@router.post("/admin/businesses", response_model=BusinessOut)
def admin_create_business(
    payload: BusinessCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Business:
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
    require_platform_admin(user)
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(business, key, value)
    business.updated_at = datetime.now(UTC)
    db.commit()
    return business


@router.post("/admin/businesses/{business_id}/owner", response_model=UserOut)
def admin_assign_owner(
    business_id: str,
    payload: OwnerAssignIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
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
