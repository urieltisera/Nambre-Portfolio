from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Business,
    DestinationType,
    DigitalMenu,
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
    list_public_categories,
    list_public_items_by_category,
)
from app.services.menu_item_image_service import build_menu_item_image_url
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
    status_value: DigitalMenuStatus,
    is_published: bool,
) -> DigitalMenu:
    existing = get_business_menu(db, business.id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Business already has a digital menu",
        )
    menu = DigitalMenu(
        business_id=business.id,
        name=name,
        template_key=template_key,
        status=status_value,
        is_published=is_published,
    )
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
    status_value: DigitalMenuStatus | None = None,
    is_published: bool | None = None,
) -> DigitalMenu:
    if name is not None:
        menu.name = name
    if template_key is not None:
        menu.template_key = template_key
    publication_status, publication_flag = _resolve_publication_fields(
        menu.status,
        menu.is_published,
        status_value,
        is_published,
    )
    menu.status = publication_status
    menu.is_published = publication_flag
    menu.updated_at = datetime.now(UTC)
    if business.destination_type == DestinationType.digital_menu:
        set_digital_menu_as_business_destination(db, business, menu)
    db.flush()
    return menu


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
    if name is not None:
        category.name = name
    if description is not None or description == "":
        category.description = description
    if position is not None:
        category.position = position
    if is_visible is not None:
        category.is_visible = is_visible
    category.updated_at = datetime.now(UTC)
    db.flush()
    return category


def remove_menu_category(db: Session, *, business_id: str, menu_id: str, category_id: str) -> None:
    category = get_business_menu_category(db, business_id, menu_id, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu category not found")
    delete_category(db, category)


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
    if name is not None:
        item.name = name
    if description is not None or description == "":
        item.description = description
    if price is not None:
        item.price = price
    if currency is not None:
        item.currency = currency
    if position is not None:
        item.position = position
    if is_visible is not None:
        item.is_visible = is_visible
    if is_available is not None:
        item.is_available = is_available
    if is_featured is not None:
        item.is_featured = is_featured
    item.updated_at = datetime.now(UTC)
    db.flush()
    return item


def remove_menu_item(db: Session, *, business_id: str, menu_id: str, item_id: str) -> None:
    item = get_business_menu_item(db, business_id, menu_id, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    image_key = item.image_key
    delete_item(db, item)
    if image_key:
        LocalStorage().delete(image_key)


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
        ensure_dynamic_link(db, business.id)
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


def get_public_digital_menu_payload(
    db: Session, public_code: str
) -> tuple[Business, DigitalMenu, list[dict[str, object]]]:
    link = db.scalar(select(DynamicLink).where(DynamicLink.public_code == public_code))
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    business = db.get(Business, link.business_id)
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    menu = db.get(DigitalMenu, link.destination_id)
    if (
        menu is None
        or menu.business_id != business.id
        or menu.status != DigitalMenuStatus.published
        or not menu.is_published
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    categories = list_public_categories(db, menu.id)
    items_by_category = list_public_items_by_category(db, menu.id)
    serialized_categories: list[dict[str, object]] = []
    for category in categories:
        category_items: list[dict[str, object]] = []
        for item in items_by_category.get(category.id, []):
            category_items.append(
                {
                    "id": item.id,
                    "category_id": item.category_id,
                    "name": item.name,
                    "description": item.description,
                    "price": item.price,
                    "currency": item.currency,
                    "image_url": (
                        build_menu_item_image_url(item.id, item.image_key)
                        if item.image_key is not None
                        else None
                    ),
                    "position": item.position,
                    "is_visible": item.is_visible,
                    "is_available": item.is_available,
                    "is_featured": item.is_featured,
                    "created_at": item.created_at,
                    "updated_at": item.updated_at,
                }
            )
        serialized_categories.append(
            {
                "id": category.id,
                "name": category.name,
                "description": category.description,
                "position": category.position,
                "is_visible": category.is_visible,
                "items": category_items,
            }
        )
    return business, menu, serialized_categories


def get_public_digital_menu_page_payload(
    db: Session, public_code: str
) -> tuple[Business, DigitalMenu, list[dict[str, object]]]:
    business, menu, categories = get_public_digital_menu_payload(db, public_code)
    return business, menu, categories


def _resolve_publication_fields(
    current_status: DigitalMenuStatus,
    current_flag: bool,
    next_status: DigitalMenuStatus | None,
    next_flag: bool | None,
) -> tuple[DigitalMenuStatus, bool]:
    status_value = next_status if next_status is not None else current_status
    flag_value = next_flag if next_flag is not None else current_flag
    if next_status is not None and next_flag is None:
        flag_value = next_status == DigitalMenuStatus.published
    if next_flag is not None and next_status is None:
        status_value = DigitalMenuStatus.published if next_flag else DigitalMenuStatus.draft
    if flag_value and status_value != DigitalMenuStatus.published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Published menus must use published status",
        )
    if not flag_value and status_value == DigitalMenuStatus.published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Published status requires is_published=true",
        )
    return status_value, flag_value
