import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import String, cast, func, select
from sqlalchemy.orm import Session

from app.models import (
    Business,
    BusinessStatus,
    DestinationType,
    DigitalMenu,
    DigitalMenuPublishedSnapshot,
    DigitalMenuStatus,
    DynamicLink,
    MenuCategory,
    MenuItem,
)
from app.repositories.digital_menu_repository import (
    create_category,
    create_digital_menu,
    create_item,
    delete_category,
    delete_item,
    get_business_menu,
    get_business_menu_category,
    get_business_menu_item,
    list_categories,
    list_items,
)
from app.services.digital_menu_theme_service import (
    DEFAULT_MENU_THEME,
    theme_payload_from_menu,
    validate_theme_readability,
)
from app.services.entitlements import BusinessFeatureKey, business_has_feature
from app.services.menu_item_image_service import (
    build_private_menu_item_image_url,
)
from app.services.menu_service import (
    ensure_dynamic_link,
    get_active_menu,
    get_or_create_dynamic_link,
)
from app.storage.local import LocalStorage


def get_business_digital_menu(
    db: Session, business_id: str, menu_id: str | None = None
) -> DigitalMenu:
    menu = get_business_menu(db, business_id, menu_id)
    if menu is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Digital menu not found")
    return menu


def create_business_digital_menu(
    db: Session,
    business: Business,
    *,
    name: str,
    template_key: str,
    theme: dict[str, object] | None,
    status_value: DigitalMenuStatus,
    is_published: bool,
) -> DigitalMenu:
    existing = get_business_menu(db, business.id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Business already has a digital menu",
        )
    if status_value != DigitalMenuStatus.draft or is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Digital menus must start as draft and require explicit publish",
        )
    menu = DigitalMenu(
        business_id=business.id,
        name=name,
        template_key=template_key,
        status=DigitalMenuStatus.draft,
        is_published=False,
        draft_revision=0,
        published_revision=0,
        published_version=0,
        published_at=None,
    )
    _apply_theme_updates(menu, theme, replacing=True)
    create_digital_menu(db, menu)
    if business.destination_type == DestinationType.digital_menu:
        set_digital_menu_as_business_destination(db, business, menu)
    return menu


def update_business_digital_menu(
    db: Session,
    business: Business,
    menu: DigitalMenu,
    *,
    name: str | None = None,
    template_key: str | None = None,
    theme: dict[str, object] | None = None,
    status_value: DigitalMenuStatus | None = None,
    is_published: bool | None = None,
) -> DigitalMenu:
    del status_value, is_published
    changed = False
    if name is not None and menu.name != name:
        menu.name = name
        changed = True
    if template_key is not None and menu.template_key != template_key:
        menu.template_key = template_key
        changed = True
    if theme is not None:
        changed = _apply_theme_updates(menu, theme, replacing=False) or changed
    if changed:
        touch_menu_revision(menu)
    if business.destination_type == DestinationType.digital_menu:
        set_digital_menu_as_business_destination(db, business, menu)
    db.flush()
    return menu


def _apply_theme_updates(
    menu: DigitalMenu,
    theme: dict[str, object] | None,
    *,
    replacing: bool,
) -> bool:
    if theme is None and not replacing:
        return False
    current_theme = theme_payload_from_menu(menu) if not replacing else dict(DEFAULT_MENU_THEME)
    merged_theme = dict(current_theme)
    if theme is not None:
        merged_theme.update(theme)
    validate_theme_readability(
        background_color=str(merged_theme["background_color"]),
        surface_color=str(merged_theme["surface_color"]),
        text_color=str(merged_theme["text_color"]),
        muted_text_color=str(merged_theme["muted_text_color"]),
    )
    changed = False
    for key in (
        "accent_color",
        "background_color",
        "surface_color",
        "text_color",
        "muted_text_color",
        "heading_font",
        "body_font",
        "card_style",
    ):
        value = merged_theme[key]
        if getattr(menu, key) != value:
            setattr(menu, key, value)
            changed = True
    return changed


def touch_menu_revision(menu: DigitalMenu) -> None:
    menu.draft_revision += 1
    menu.updated_at = datetime.now(UTC)


def list_menu_categories(db: Session, business_id: str, menu_id: str) -> list[MenuCategory]:
    get_business_digital_menu(db, business_id, menu_id)
    return list_categories(db, menu_id)


def create_menu_category(
    db: Session,
    *,
    business_id: str,
    menu_id: str,
    name: str,
    description: str | None,
    position: int,
    is_visible: bool,
) -> MenuCategory:
    menu = get_business_digital_menu(db, business_id, menu_id)
    category = MenuCategory(
        digital_menu_id=menu.id,
        name=name,
        description=description,
        position=position,
        is_visible=is_visible,
    )
    create_category(db, category)
    touch_menu_revision(menu)
    db.flush()
    return category


def update_menu_category(
    db: Session,
    *,
    business_id: str,
    menu_id: str,
    category_id: str,
    name: str | None = None,
    description: str | None = None,
    position: int | None = None,
    is_visible: bool | None = None,
) -> MenuCategory:
    category = get_business_menu_category(db, business_id, menu_id, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu category not found")
    changed = False
    if name is not None and category.name != name:
        category.name = name
        changed = True
    if (description is not None or description == "") and category.description != description:
        category.description = description
        changed = True
    if position is not None and category.position != position:
        category.position = position
        changed = True
    if is_visible is not None and category.is_visible != is_visible:
        category.is_visible = is_visible
        changed = True
    if changed:
        category.updated_at = datetime.now(UTC)
        touch_menu_revision(get_business_digital_menu(db, business_id, menu_id))
    db.flush()
    return category


def remove_menu_category(db: Session, *, business_id: str, menu_id: str, category_id: str) -> None:
    category = get_business_menu_category(db, business_id, menu_id, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu category not found")
    image_keys = [
        item.image_key
        for item in db.scalars(select(MenuItem).where(MenuItem.category_id == category.id)).all()
        if item.image_key
    ]
    delete_category(db, category)
    _delete_unreferenced_image_keys(db, image_keys)
    touch_menu_revision(get_business_digital_menu(db, business_id, menu_id))
    db.flush()


def list_menu_items(db: Session, business_id: str, menu_id: str) -> list[MenuItem]:
    get_business_digital_menu(db, business_id, menu_id)
    return list_items(db, menu_id)


def create_menu_item(
    db: Session,
    *,
    business_id: str,
    menu_id: str,
    category_id: str,
    name: str,
    description: str | None,
    price: Decimal,
    currency: str,
    position: int,
    is_visible: bool,
    is_available: bool,
    is_featured: bool,
) -> MenuItem:
    category = get_business_menu_category(db, business_id, menu_id, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu category not found")
    item = MenuItem(
        category_id=category.id,
        name=name,
        description=description,
        price=price,
        currency=currency,
        position=position,
        is_visible=is_visible,
        is_available=is_available,
        is_featured=is_featured,
    )
    create_item(db, item)
    touch_menu_revision(get_business_digital_menu(db, business_id, menu_id))
    db.flush()
    return item


def update_menu_item(
    db: Session,
    *,
    business_id: str,
    menu_id: str,
    item_id: str,
    name: str | None = None,
    description: str | None = None,
    price: Decimal | None = None,
    currency: str | None = None,
    position: int | None = None,
    is_visible: bool | None = None,
    is_available: bool | None = None,
    is_featured: bool | None = None,
) -> MenuItem:
    item = get_business_menu_item(db, business_id, menu_id, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    changed = False
    if name is not None and item.name != name:
        item.name = name
        changed = True
    if (description is not None or description == "") and item.description != description:
        item.description = description
        changed = True
    if price is not None and item.price != price:
        item.price = price
        changed = True
    if currency is not None and item.currency != currency:
        item.currency = currency
        changed = True
    if position is not None and item.position != position:
        item.position = position
        changed = True
    if is_visible is not None and item.is_visible != is_visible:
        item.is_visible = is_visible
        changed = True
    if is_available is not None and item.is_available != is_available:
        item.is_available = is_available
        changed = True
    if is_featured is not None and item.is_featured != is_featured:
        item.is_featured = is_featured
        changed = True
    if changed:
        item.updated_at = datetime.now(UTC)
        touch_menu_revision(get_business_digital_menu(db, business_id, menu_id))
    db.flush()
    return item


def remove_menu_item(db: Session, *, business_id: str, menu_id: str, item_id: str) -> None:
    item = get_business_menu_item(db, business_id, menu_id, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    image_key = item.image_key
    delete_item(db, item)
    _delete_unreferenced_image_keys(db, [image_key] if image_key else [])
    touch_menu_revision(get_business_digital_menu(db, business_id, menu_id))
    db.flush()


def set_digital_menu_as_business_destination(
    db: Session,
    business: Business,
    menu: DigitalMenu | None = None,
) -> DynamicLink:
    target_menu = menu or get_business_menu(db, business.id)
    if target_menu is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A digital menu must exist before enabling that destination",
        )
    link = ensure_dynamic_link(db, business.id)
    link.destination_type = DestinationType.digital_menu
    link.destination_id = target_menu.id
    link.updated_at = datetime.now(UTC)
    return link


def sync_current_destination(db: Session, business: Business) -> None:
    if business.destination_type == DestinationType.external_url:
        link = ensure_dynamic_link(db, business.id)
        link.destination_type = DestinationType.external_url
        link.updated_at = datetime.now(UTC)
        return
    if business.destination_type == DestinationType.digital_menu:
        set_digital_menu_as_business_destination(db, business)
        return
    if business.destination_type == DestinationType.menu_pdf:
        active_menu = get_active_menu(db, business.id)
        if active_menu is None:
            return
        link = get_or_create_dynamic_link(db, business.id, active_menu.id)
        link.destination_type = DestinationType.menu_pdf
        link.destination_id = active_menu.id
        link.updated_at = datetime.now(UTC)


def build_draft_preview_payload(
    db: Session, business: Business, menu: DigitalMenu
) -> dict[str, object]:
    categories = list_categories(db, menu.id)
    items = list_items(db, menu.id)
    return _build_page_payload(
        business=business,
        menu=menu,
        categories=categories,
        items=items,
        image_url_builder=lambda item: _build_draft_item_image_url(
            business.id, menu.id, item
        ),
        include_hidden=True,
    )


def publish_digital_menu(
    db: Session,
    *,
    business: Business,
    menu: DigitalMenu,
    actor_user_id: str | None,
) -> DigitalMenuPublishedSnapshot:
    payload = build_draft_preview_payload(db, business, menu)
    public_categories = [
        category
        for category in payload["categories"]  # type: ignore[index]
        if category["is_visible"] and category["items"]
    ]
    if not public_categories:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one visible category with visible items is required",
        )
    next_version = _next_snapshot_version(db, menu.id)
    now = datetime.now(UTC)
    snapshot_payload = _snapshot_payload_from_preview_payload(payload, menu.id, next_version, now)
    snapshot = DigitalMenuPublishedSnapshot(
        digital_menu_id=menu.id,
        created_by_user_id=actor_user_id,
        version=next_version,
        payload=snapshot_payload,
        published_at=now,
    )
    db.add(snapshot)
    db.flush()
    menu.is_published = True
    menu.status = DigitalMenuStatus.published
    menu.published_version = next_version
    menu.published_revision = menu.draft_revision
    menu.published_at = now
    menu.updated_at = now
    db.flush()
    return snapshot


def unpublish_digital_menu(menu: DigitalMenu) -> DigitalMenu:
    menu.is_published = False
    menu.status = DigitalMenuStatus.draft
    menu.updated_at = datetime.now(UTC)
    return menu


def get_latest_published_snapshot(
    db: Session, menu_id: str
) -> DigitalMenuPublishedSnapshot | None:
    return db.scalar(
        select(DigitalMenuPublishedSnapshot)
        .where(DigitalMenuPublishedSnapshot.digital_menu_id == menu_id)
        .order_by(DigitalMenuPublishedSnapshot.version.desc())
    )


def get_public_digital_menu_payload(
    db: Session, public_code: str
) -> tuple[Business, DigitalMenu, dict[str, object]]:
    link = db.scalar(select(DynamicLink).where(DynamicLink.public_code == public_code))
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    business = db.get(Business, link.business_id)
    if (
        business is None
        or not link.is_active
        or business.status not in {BusinessStatus.active, BusinessStatus.demo}
        or business.destination_type != DestinationType.digital_menu
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    menu = db.get(DigitalMenu, link.destination_id)
    if (
        menu is None
        or menu.business_id != business.id
        or not menu.is_published
        or not business_has_feature(business, BusinessFeatureKey.digital_menu)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    snapshot = get_latest_published_snapshot(db, menu.id)
    if snapshot is None or snapshot.version != menu.published_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return business, menu, snapshot.payload


def get_public_digital_menu_page_payload(
    db: Session, public_code: str
) -> tuple[Business, DigitalMenu, dict[str, object]]:
    business, menu, payload = get_public_digital_menu_payload(db, public_code)
    return business, menu, payload


def public_menu_response_from_snapshot(
    payload: dict[str, object], public_code: str
) -> dict[str, object]:
    business = dict(payload["business"])  # type: ignore[arg-type]
    menu = dict(payload["menu"])  # type: ignore[arg-type]
    theme = dict(payload["theme"])  # type: ignore[arg-type]
    categories = []
    for category in payload["categories"]:  # type: ignore[index]
        category_copy = dict(category)
        items = []
        for item in category_copy["items"]:
            item_copy = dict(item)
            image_key = item_copy.pop("image_key", None)
            image_filename = item_copy.pop("image_filename", None)
            item_copy["image_url"] = (
                build_public_snapshot_image_url(
                    public_code,
                    int(menu["published_version"]),
                    item_copy["id"],
                    image_filename,
                )
                if image_key and image_filename
                else None
            )
            items.append(item_copy)
        category_copy["items"] = items
        categories.append(category_copy)
    return {
        "business": business,
        "menu": menu,
        "theme": theme,
        "categories": categories,
    }


def build_public_snapshot_image_url(
    public_code: str, version: int, item_id: str, filename: str
) -> str:
    return f"/api/public/digital-menus/{public_code}/images/{version}/{item_id}/{filename}"


def get_published_snapshot_image_key(
    db: Session,
    *,
    public_code: str,
    version: int,
    item_id: str,
    filename: str,
) -> str:
    _, menu, payload = get_public_digital_menu_payload(db, public_code)
    if menu.published_version != version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    for category in payload["categories"]:  # type: ignore[index]
        for item in category["items"]:
            if item["id"] != item_id:
                continue
            if not item.get("is_visible") or not category.get("is_visible"):
                break
            image_key = item.get("image_key")
            image_filename = item.get("image_filename")
            if not image_key or image_filename != filename:
                break
            return str(image_key)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def is_image_key_referenced_by_published_snapshot(db: Session, image_key: str) -> bool:
    if not image_key:
        return False
    pattern = f'%"{image_key}"%'
    return (
        db.scalar(
            select(func.count())
            .select_from(DigitalMenuPublishedSnapshot)
            .where(cast(DigitalMenuPublishedSnapshot.payload, String).like(pattern))
        )
        or 0
    ) > 0


def _delete_unreferenced_image_keys(db: Session, image_keys: list[str]) -> None:
    if not image_keys:
        return
    storage = LocalStorage()
    for image_key in image_keys:
        if image_key and not is_image_key_referenced_by_published_snapshot(db, image_key):
            storage.delete(image_key)


def _build_page_payload(
    *,
    business: Business,
    menu: DigitalMenu,
    categories: list[MenuCategory],
    items: list[MenuItem],
    image_url_builder: Any,
    include_hidden: bool,
) -> dict[str, object]:
    items_by_category: dict[str, list[dict[str, object]]] = {}
    for item in items:
        payload_item = _serialize_item(item, image_url_builder(item), include_hidden=include_hidden)
        items_by_category.setdefault(item.category_id, []).append(payload_item)
    serialized_categories: list[dict[str, object]] = []
    for category in categories:
        category_items = items_by_category.get(category.id, [])
        if not include_hidden:
            category_items = [item for item in category_items if item["is_visible"]]
        category_items.sort(key=lambda item: (int(item["position"]), str(item["id"])))
        serialized_category = {
            "id": category.id,
            "name": category.name,
            "description": category.description,
            "position": category.position,
            "is_visible": category.is_visible,
            "items": category_items,
        }
        if include_hidden or (category.is_visible and category_items):
            serialized_categories.append(serialized_category)
    serialized_categories.sort(
        key=lambda category: (int(category["position"]), str(category["id"]))
    )
    return {
        "business": {
            "id": business.id,
            "name": business.name,
            "logo_url": business.logo_url,
        },
        "menu": _serialize_menu(menu),
        "theme": dict(menu.theme),
        "categories": serialized_categories,
    }


def _serialize_menu(menu: DigitalMenu) -> dict[str, object]:
    return {
        "id": menu.id,
        "business_id": menu.business_id,
        "name": menu.name,
        "status": menu.status.value,
        "template_key": menu.template_key,
        "theme": dict(menu.theme),
        "is_published": menu.is_published,
        "draft_revision": menu.draft_revision,
        "published_revision": menu.published_revision,
        "published_version": menu.published_version,
        "published_at": menu.published_at.isoformat() if menu.published_at else None,
        "has_unpublished_changes": menu.has_unpublished_changes,
        "has_publication": menu.has_publication,
        "created_at": menu.created_at.isoformat(),
        "updated_at": menu.updated_at.isoformat(),
    }


def _serialize_item(
    item: MenuItem,
    image_url: str | None,
    *,
    include_hidden: bool,
) -> dict[str, object]:
    payload = {
        "id": item.id,
        "category_id": item.category_id,
        "name": item.name,
        "description": item.description,
        "price": str(item.price),
        "currency": item.currency,
        "image_key": item.image_key,
        "image_url": image_url,
        "position": item.position,
        "is_visible": item.is_visible,
        "is_available": item.is_available,
        "is_featured": item.is_featured,
    }
    if include_hidden:
        payload["created_at"] = item.created_at.isoformat()
        payload["updated_at"] = item.updated_at.isoformat()
    return payload


def _build_draft_item_image_url(
    business_id: str,
    menu_id: str,
    item: MenuItem,
) -> str | None:
    if not item.image_key:
        return None
    return build_private_menu_item_image_url(business_id, menu_id, item.id)


def _snapshot_payload_from_preview_payload(
    payload: dict[str, object],
    menu_id: str,
    version: int,
    published_at: datetime,
) -> dict[str, object]:
    snapshot = json.loads(json.dumps(payload))
    snapshot["menu"]["status"] = DigitalMenuStatus.published.value
    snapshot["menu"]["is_published"] = True
    snapshot["menu"]["published_version"] = version
    snapshot["menu"]["published_at"] = published_at.isoformat()
    snapshot["menu"]["published_revision"] = snapshot["menu"]["draft_revision"]
    snapshot["menu"]["has_unpublished_changes"] = False
    snapshot["menu"]["has_publication"] = True
    snapshot["snapshot"] = {
        "digital_menu_id": menu_id,
        "version": version,
        "published_at": published_at.isoformat(),
    }
    public_categories: list[dict[str, object]] = []
    for category in snapshot["categories"]:
        if not category["is_visible"]:
            continue
        public_items: list[dict[str, object]] = []
        for item in category["items"]:
            if not item["is_visible"]:
                continue
            item["image_key"] = None
            item["image_filename"] = None
            draft_item = next(
                (
                    source_item
                    for source_category in payload["categories"]  # type: ignore[index]
                    if source_category["id"] == category["id"]
                    for source_item in source_category["items"]
                    if source_item["id"] == item["id"]
                ),
                None,
            )
            if draft_item is not None:
                public_key = draft_item.get("image_key")
                if public_key:
                    item["image_key"] = public_key
                    item["image_filename"] = Path(str(public_key)).name
            item["image_url"] = None
            public_items.append(item)
        if public_items:
            category["items"] = public_items
            public_categories.append(category)
    snapshot["categories"] = public_categories
    return snapshot


def _next_snapshot_version(db: Session, menu_id: str) -> int:
    current_version = db.scalar(
        select(func.max(DigitalMenuPublishedSnapshot.version)).where(
            DigitalMenuPublishedSnapshot.digital_menu_id == menu_id
        )
    )
    return int(current_version or 0) + 1
