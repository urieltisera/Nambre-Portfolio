from pathlib import Path
from secrets import token_urlsafe

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    DestinationType,
    DynamicLink,
    MenuAsset,
    MenuAssetStatus,
    User,
)
from app.storage.local import LocalStorage

ALLOWED_PDF_TYPES = {"application/pdf"}
PDF_SIGNATURE = b"%PDF-"


def get_active_menu(db: Session, business_id: str) -> MenuAsset | None:
    return db.scalar(
        select(MenuAsset)
        .where(MenuAsset.business_id == business_id, MenuAsset.status == MenuAssetStatus.active)
        .order_by(MenuAsset.version.desc())
    )


def get_or_create_dynamic_link(db: Session, business_id: str, menu_asset_id: str) -> DynamicLink:
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business_id))
    if link is not None:
        link.destination_type = DestinationType.menu_pdf
        link.destination_id = menu_asset_id
        return link
    return ensure_dynamic_link(db, business_id, menu_asset_id=menu_asset_id)


def ensure_dynamic_link(
    db: Session,
    business_id: str,
    *,
    menu_asset_id: str | None = None,
) -> DynamicLink:
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business_id))
    if link is not None:
        if menu_asset_id is not None:
            link.destination_id = menu_asset_id
            link.destination_type = DestinationType.menu_pdf
        return link
    while True:
        code = token_urlsafe(12)
        exists = db.scalar(select(DynamicLink).where(DynamicLink.public_code == code))
        if exists is None:
            link = DynamicLink(
                business_id=business_id,
                public_code=code,
                destination_type=DestinationType.menu_pdf,
                destination_id=menu_asset_id or "",
                is_active=True,
            )
            db.add(link)
            return link


async def upload_menu_pdf(
    db: Session,
    business_id: str,
    uploaded_by: User,
    file: UploadFile,
    storage: LocalStorage | None = None,
) -> MenuAsset:
    settings = get_settings()
    if file.content_type not in ALLOWED_PDF_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF uploads are allowed"
        )

    storage = storage or LocalStorage()
    suffix = Path(file.filename or "menu.pdf").suffix.lower()
    if suffix != ".pdf":
        suffix = ".pdf"
    key = storage.build_key(business_id, suffix)
    size = await storage.save_upload(file, key)
    if size == 0:
        storage.open(key).unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PDF file is empty")
    if size > settings.max_pdf_bytes:
        storage.open(key).unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="PDF too large"
        )
    if not storage.starts_with(key, PDF_SIGNATURE):
        storage.open(key).unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid PDF",
        )

    current = get_active_menu(db, business_id)
    next_version = (
        db.scalar(select(func.max(MenuAsset.version)).where(MenuAsset.business_id == business_id))
        or 0
    ) + 1
    if current is not None:
        current.status = MenuAssetStatus.archived

    asset = MenuAsset(
        business_id=business_id,
        storage_key=key,
        original_filename=Path(file.filename or "menu.pdf").name,
        content_type="application/pdf",
        file_size=size,
        version=next_version,
        status=MenuAssetStatus.active,
        uploaded_by=uploaded_by.id,
    )
    db.add(asset)
    db.flush()
    get_or_create_dynamic_link(db, business_id, asset.id)
    return asset


def rollback_menu(db: Session, business_id: str, menu_asset_id: str) -> MenuAsset:
    target = db.scalar(
        select(MenuAsset).where(MenuAsset.id == menu_asset_id, MenuAsset.business_id == business_id)
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu version not found")
    for asset in db.scalars(select(MenuAsset).where(MenuAsset.business_id == business_id)).all():
        asset.status = MenuAssetStatus.active if asset.id == target.id else MenuAssetStatus.archived
    link = get_or_create_dynamic_link(db, business_id, target.id)
    link.destination_id = target.id
    return target
