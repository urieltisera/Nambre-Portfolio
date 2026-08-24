import warnings
from dataclasses import dataclass
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import String, cast, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import DigitalMenu, DigitalMenuPublishedSnapshot, MenuCategory, MenuItem
from app.repositories.digital_menu_repository import get_business_menu_item
from app.storage.local import LocalStorage

ALLOWED_PRODUCT_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}
PRODUCT_IMAGE_FORMAT = "WEBP"
PRODUCT_IMAGE_SUFFIX = ".webp"
PRODUCT_IMAGE_QUALITY = 84


@dataclass(frozen=True)
class ProcessedMenuItemImage:
    content: bytes
    height: int
    width: int


def build_menu_item_image_url(item_id: str, image_key: str) -> str:
    return f"/media/menu-items/{item_id}/{Path(image_key).name}"


def build_private_menu_item_image_url(business_id: str, menu_id: str, item_id: str) -> str:
    return f"/api/businesses/{business_id}/digital-menu/{menu_id}/items/{item_id}/image"


async def upload_menu_item_image(
    db: Session,
    *,
    business_id: str,
    menu_id: str,
    item_id: str,
    file: UploadFile,
    storage: LocalStorage | None = None,
) -> MenuItem:
    item = get_business_menu_item(db, business_id, menu_id, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    if file.content_type not in ALLOWED_PRODUCT_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, and WebP product images are allowed",
        )

    settings = get_settings()
    original = await file.read()
    await file.seek(0)
    if len(original) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image file is empty")
    if len(original) > settings.max_product_image_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Product image too large",
        )

    processed = _process_product_image(original)
    storage = storage or LocalStorage()
    next_key = storage.menu_item_image_key(business_id, item.id, PRODUCT_IMAGE_SUFFIX)
    storage.save_bytes(next_key, processed.content)

    previous_key = item.image_key
    previous_url = item.image_url
    previous_updated_at = item.updated_at
    menu = _get_item_menu(db, item.id)
    previous_menu_revision = menu.draft_revision if menu is not None else None
    previous_menu_updated_at = menu.updated_at if menu is not None else None
    item.image_key = next_key
    item.image_url = build_private_menu_item_image_url(business_id, menu_id, item.id)
    item.updated_at = datetime.now(UTC)
    if menu is not None:
        _touch_menu_revision(menu)
    try:
        db.flush()
    except Exception:
        storage.delete(next_key)
        item.image_key = previous_key
        item.image_url = previous_url
        item.updated_at = previous_updated_at
        if menu is not None:
            menu.draft_revision = previous_menu_revision or 0
            menu.updated_at = previous_menu_updated_at or previous_updated_at
        raise

    if (
        previous_key
        and previous_key != next_key
        and not _is_image_key_referenced_by_snapshot(db, previous_key)
    ):
        storage.delete(previous_key)
    return item


def delete_menu_item_image(
    db: Session,
    *,
    business_id: str,
    menu_id: str,
    item_id: str,
    storage: LocalStorage | None = None,
) -> MenuItem:
    item = get_business_menu_item(db, business_id, menu_id, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")

    previous_key = item.image_key
    menu = _get_item_menu(db, item.id)
    item.image_key = None
    item.image_url = None
    item.updated_at = datetime.now(UTC)
    if menu is not None:
        _touch_menu_revision(menu)
    db.flush()

    if previous_key and not _is_image_key_referenced_by_snapshot(db, previous_key):
        (storage or LocalStorage()).delete(previous_key)
    return item


def _get_item_menu(db: Session, item_id: str) -> DigitalMenu | None:
    return db.scalar(
        select(DigitalMenu)
        .join(MenuCategory, MenuCategory.digital_menu_id == DigitalMenu.id)
        .join(MenuItem, MenuItem.category_id == MenuCategory.id)
        .where(MenuItem.id == item_id)
    )


def _touch_menu_revision(menu: DigitalMenu) -> None:
    menu.draft_revision += 1
    menu.updated_at = datetime.now(UTC)


def _is_image_key_referenced_by_snapshot(db: Session, image_key: str) -> bool:
    pattern = f'%"{image_key}"%'
    return (
        db.scalar(
            select(func.count())
            .select_from(DigitalMenuPublishedSnapshot)
            .where(cast(DigitalMenuPublishedSnapshot.payload, String).like(pattern))
        )
        or 0
    ) > 0


def _process_product_image(content: bytes) -> ProcessedMenuItemImage:
    settings = get_settings()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                normalized = ImageOps.exif_transpose(source)
                normalized.load()
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid product image",
        ) from exc

    if normalized.width <= 0 or normalized.height <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid product image",
        )
    if max(normalized.width, normalized.height) > settings.max_product_image_source_dimension:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product image dimensions are too large",
        )

    has_alpha = normalized.mode in {"RGBA", "LA"} or "transparency" in normalized.info
    converted = normalized.convert("RGBA" if has_alpha else "RGB")
    converted.thumbnail(
        (settings.product_image_max_dimension, settings.product_image_max_dimension),
        Image.Resampling.LANCZOS,
    )

    output = BytesIO()
    converted.save(
        output,
        format=PRODUCT_IMAGE_FORMAT,
        method=6,
        quality=PRODUCT_IMAGE_QUALITY,
    )
    return ProcessedMenuItemImage(
        content=output.getvalue(),
        width=converted.width,
        height=converted.height,
    )
