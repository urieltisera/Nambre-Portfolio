from collections import defaultdict

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models import DigitalMenu, MenuCategory, MenuItem


def _ordered_categories(query: Select[tuple[MenuCategory]]) -> Select[tuple[MenuCategory]]:
    return query.order_by(MenuCategory.position.asc(), MenuCategory.created_at.asc())


def _ordered_items(query: Select[tuple[MenuItem]]) -> Select[tuple[MenuItem]]:
    return query.order_by(MenuItem.position.asc(), MenuItem.created_at.asc())


def get_business_menu(
    db: Session, business_id: str, menu_id: str | None = None
) -> DigitalMenu | None:
    query = select(DigitalMenu).where(DigitalMenu.business_id == business_id)
    if menu_id is not None:
        query = query.where(DigitalMenu.id == menu_id)
    return db.scalar(query.order_by(DigitalMenu.created_at.asc()))


def create_digital_menu(db: Session, menu: DigitalMenu) -> DigitalMenu:
    db.add(menu)
    db.flush()
    return menu


def list_categories(db: Session, menu_id: str) -> list[MenuCategory]:
    query = select(MenuCategory).where(MenuCategory.digital_menu_id == menu_id)
    return list(db.scalars(_ordered_categories(query)).all())


def get_business_menu_category(
    db: Session,
    business_id: str,
    menu_id: str,
    category_id: str,
) -> MenuCategory | None:
    query = (
        select(MenuCategory)
        .join(DigitalMenu, MenuCategory.digital_menu_id == DigitalMenu.id)
        .where(
            MenuCategory.id == category_id,
            MenuCategory.digital_menu_id == menu_id,
            DigitalMenu.business_id == business_id,
        )
    )
    return db.scalar(query)


def create_category(db: Session, category: MenuCategory) -> MenuCategory:
    db.add(category)
    db.flush()
    return category


def delete_category(db: Session, category: MenuCategory) -> None:
    db.delete(category)
    db.flush()


def list_items(db: Session, menu_id: str) -> list[MenuItem]:
    query = (
        select(MenuItem)
        .join(MenuCategory, MenuItem.category_id == MenuCategory.id)
        .where(MenuCategory.digital_menu_id == menu_id)
    )
    return list(db.scalars(_ordered_items(query)).all())


def get_business_menu_item(
    db: Session,
    business_id: str,
    menu_id: str,
    item_id: str,
) -> MenuItem | None:
    query = (
        select(MenuItem)
        .join(MenuCategory, MenuItem.category_id == MenuCategory.id)
        .join(DigitalMenu, MenuCategory.digital_menu_id == DigitalMenu.id)
        .where(
            MenuItem.id == item_id,
            MenuCategory.digital_menu_id == menu_id,
            DigitalMenu.business_id == business_id,
        )
    )
    return db.scalar(query)


def create_item(db: Session, item: MenuItem) -> MenuItem:
    db.add(item)
    db.flush()
    return item


def delete_item(db: Session, item: MenuItem) -> None:
    db.delete(item)
    db.flush()


def list_public_categories(db: Session, menu_id: str) -> list[MenuCategory]:
    query = select(MenuCategory).where(
        MenuCategory.digital_menu_id == menu_id,
        MenuCategory.is_visible.is_(True),
    )
    return list(db.scalars(_ordered_categories(query)).all())


def list_public_items_by_category(db: Session, menu_id: str) -> dict[str, list[MenuItem]]:
    query = (
        select(MenuItem)
        .join(MenuCategory, MenuItem.category_id == MenuCategory.id)
        .where(
            MenuCategory.digital_menu_id == menu_id,
            MenuCategory.is_visible.is_(True),
            MenuItem.is_visible.is_(True),
        )
    )
    grouped: dict[str, list[MenuItem]] = defaultdict(list)
    for item in db.scalars(_ordered_items(query)).all():
        grouped[item.category_id].append(item)
    return grouped
