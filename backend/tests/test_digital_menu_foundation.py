from decimal import Decimal
from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Business,
    BusinessPlanKey,
    BusinessStatus,
    DestinationType,
    DynamicLink,
    MembershipRole,
    MenuItem,
)
from app.storage.local import LocalStorage
from tests.conftest import add_membership, auth_headers, make_business, make_user

DEFAULT_THEME = {
    "accent_color": "#955F32",
    "background_color": "#F6F0E8",
    "surface_color": "#FFF7EE",
    "text_color": "#241711",
    "muted_text_color": "#6F6258",
    "heading_font": "editorial",
    "body_font": "clean",
    "card_style": "rounded",
}


def _create_menu_with_category(
    client, business_id: str, headers: dict[str, str]
) -> tuple[str, str]:
    menu = client.post(
        f"/api/businesses/{business_id}/digital-menu",
        headers=headers,
        json={"name": "Carta premium"},
    )
    assert menu.status_code == 200
    category = client.post(
        f"/api/businesses/{business_id}/digital-menu/{menu.json()['id']}/categories",
        headers=headers,
        json={"name": "Principales"},
    )
    assert category.status_code == 200
    return menu.json()["id"], category.json()["id"]


def _pdf_upload() -> dict[str, tuple[str, BytesIO, str]]:
    return {"file": ("menu.pdf", BytesIO(b"%PDF-1.4\n%downgrade\n%%EOF\n"), "application/pdf")}


def _image_upload(
    filename: str,
    content: bytes,
    content_type: str,
) -> dict[str, tuple[str, BytesIO, str]]:
    return {"file": (filename, BytesIO(content), content_type)}


def _image_bytes(
    *,
    format_name: str,
    size: tuple[int, int] = (1500, 900),
    color: tuple[int, int, int] = (210, 90, 45),
    with_exif_orientation: bool = False,
) -> bytes:
    image = Image.new("RGB", size, color)
    output = BytesIO()
    save_kwargs: dict[str, object] = {"format": format_name}
    if with_exif_orientation:
        exif = Image.Exif()
        exif[274] = 6
        save_kwargs["exif"] = exif
    image.save(output, **save_kwargs)
    return output.getvalue()


def _image_center_rgb(content: bytes) -> tuple[int, int, int]:
    with Image.open(BytesIO(content)) as image:
        rgb = image.convert("RGB")
        x = rgb.width // 2
        y = rgb.height // 2
        return rgb.getpixel((x, y))


def _create_menu_item(
    client,
    business_id: str,
    menu_id: str,
    category_id: str,
    headers: dict[str, str],
    *,
    name: str = "Producto",
    price: str = "1500.00",
) -> dict[str, object]:
    response = client.post(
        f"/api/businesses/{business_id}/digital-menu/{menu_id}/categories/{category_id}/items",
        headers=headers,
        json={"name": name, "price": price, "currency": "ARS"},
    )
    assert response.status_code == 200
    return response.json()


def _publish_menu(
    client,
    business_id: str,
    menu_id: str,
    headers: dict[str, str],
) -> dict[str, object]:
    response = client.post(
        f"/api/businesses/{business_id}/digital-menu/{menu_id}/publish",
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()


def test_owner_can_create_and_read_digital_menu(client, db: Session) -> None:
    owner = make_user(db, "menu-owner@example.com")
    outsider = make_user(db, "menu-outsider@example.com")
    business = make_business(
        db, "Menu Biz", "menu-biz", plan_key=BusinessPlanKey.premium
    )
    outsider_business = make_business(
        db, "Other Biz", "other-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    add_membership(db, outsider, outsider_business, MembershipRole.owner)

    created = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={"name": "Carta principal", "template_key": "modern"},
    )
    assert created.status_code == 200
    assert created.json()["name"] == "Carta principal"
    assert created.json()["status"] == "draft"
    assert created.json()["is_published"] is False

    fetched = client.get(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
    )
    assert fetched.status_code == 200
    assert fetched.json()["id"] == created.json()["id"]

    forbidden = client.get(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(outsider),
    )
    assert forbidden.status_code == 403

    missing = client.get(
        f"/api/businesses/{business.id}/digital-menu/not-real",
        headers=auth_headers(owner),
    )
    assert missing.status_code == 405


def test_digital_menu_theme_defaults_read_update_and_isolation(client, db: Session) -> None:
    owner = make_user(db, "theme-owner@example.com")
    outsider = make_user(db, "theme-outsider@example.com")
    business = make_business(
        db, "Theme Biz", "theme-biz", plan_key=BusinessPlanKey.premium
    )
    outsider_business = make_business(
        db, "Theme Other", "theme-other", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    add_membership(db, outsider, outsider_business, MembershipRole.owner)

    created = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={"name": "Carta visual"},
    )
    assert created.status_code == 200
    assert created.json()["theme"] == DEFAULT_THEME

    fetched = client.get(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
    )
    assert fetched.status_code == 200
    assert fetched.json()["theme"] == DEFAULT_THEME

    updated = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{created.json()['id']}",
        headers=auth_headers(owner),
        json={
            "theme": {
                "accent_color": "#1F3A2D",
                "background_color": "#FAF7F2",
                "surface_color": "#FFFDF9",
                "text_color": "#17110E",
                "muted_text_color": "#5C524A",
                "heading_font": "rounded",
                "body_font": "modern",
                "card_style": "square",
            }
        },
    )
    assert updated.status_code == 200
    assert updated.json()["theme"] == {
        "accent_color": "#1F3A2D",
        "background_color": "#FAF7F2",
        "surface_color": "#FFFDF9",
        "text_color": "#17110E",
        "muted_text_color": "#5C524A",
        "heading_font": "rounded",
        "body_font": "modern",
        "card_style": "square",
    }

    forbidden = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{created.json()['id']}",
        headers=auth_headers(outsider),
        json={"theme": {"accent_color": "#000000"}},
    )
    assert forbidden.status_code == 403


def test_essential_business_cannot_read_or_update_digital_menu_theme(client, db: Session) -> None:
    owner = make_user(db, "theme-essential@example.com")
    business = make_business(
        db, "Theme Essential", "theme-essential", plan_key=BusinessPlanKey.essential
    )
    add_membership(db, owner, business, MembershipRole.owner)

    fetched = client.get(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
    )
    assert fetched.status_code == 403

    created = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={"name": "Carta bloqueada"},
    )
    assert created.status_code == 403


def test_digital_menu_theme_validation_rejects_invalid_values(client, db: Session) -> None:
    owner = make_user(db, "theme-validation@example.com")
    business = make_business(
        db, "Theme Validation", "theme-validation", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)

    created = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={"name": "Carta validacion"},
    )
    assert created.status_code == 200

    invalid_color = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{created.json()['id']}",
        headers=auth_headers(owner),
        json={"theme": {"accent_color": "rgb(1,2,3)"}},
    )
    assert invalid_color.status_code == 422

    invalid_font = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{created.json()['id']}",
        headers=auth_headers(owner),
        json={"theme": {"heading_font": "wild"}},
    )
    assert invalid_font.status_code == 422

    invalid_card = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{created.json()['id']}",
        headers=auth_headers(owner),
        json={"theme": {"card_style": "pill"}},
    )
    assert invalid_card.status_code == 422

    low_contrast = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{created.json()['id']}",
        headers=auth_headers(owner),
        json={
            "theme": {
                "background_color": "#F6F0E8",
                "surface_color": "#FFF7EE",
                "text_color": "#F6F0E8",
            }
        },
    )
    assert low_contrast.status_code == 422


def test_public_digital_menu_api_returns_theme_without_private_fields(client, db: Session) -> None:
    owner = make_user(db, "theme-public@example.com")
    business = make_business(
        db, "Theme Public", "theme-public", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)

    created = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={
            "name": "Carta pública",
            "theme": {
                "accent_color": "#222222",
                "background_color": "#15171B",
                "surface_color": "#242930",
                "text_color": "#F4EFE8",
                "muted_text_color": "#C2B9AD",
                "heading_font": "modern",
                "body_font": "modern",
                "card_style": "soft",
            },
        },
    )
    assert created.status_code == 200
    menu_id = created.json()["id"]
    category = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/categories",
        headers=auth_headers(owner),
        json={"name": "Principales", "position": 0},
    )
    assert category.status_code == 200
    item = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/categories/{category.json()['id']}/items",
        headers=auth_headers(owner),
        json={"name": "Cafe", "price": "2000.00", "currency": "ARS"},
    )
    assert item.status_code == 200
    _publish_menu(client, business.id, menu_id, auth_headers(owner))

    switched = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(owner),
        json={"destination_type": "digital_menu"},
    )
    assert switched.status_code == 200

    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None

    response = client.get(f"/api/public/digital-menus/{link.public_code}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["theme"] == {
        "accent_color": "#222222",
        "background_color": "#15171B",
        "surface_color": "#242930",
        "text_color": "#F4EFE8",
        "muted_text_color": "#C2B9AD",
        "heading_font": "modern",
        "body_font": "modern",
        "card_style": "soft",
    }
    assert "updated_at" not in payload["theme"]
    assert "created_at" not in payload["theme"]


def test_category_crud_order_visibility_and_isolation(client, db: Session) -> None:
    owner = make_user(db, "category-owner@example.com")
    outsider = make_user(db, "category-outsider@example.com")
    business = make_business(
        db, "Category Biz", "category-biz", plan_key=BusinessPlanKey.premium
    )
    outsider_business = make_business(
        db, "Category Other", "category-other", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    add_membership(db, outsider, outsider_business, MembershipRole.owner)

    menu = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={"name": "Carta categorias"},
    ).json()

    bebidas = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories",
        headers=auth_headers(owner),
        json={"name": "Bebidas", "position": 2},
    )
    assert bebidas.status_code == 200
    comida = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories",
        headers=auth_headers(owner),
        json={"name": "Comidas", "position": 1},
    )
    assert comida.status_code == 200

    listed = client.get(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories",
        headers=auth_headers(owner),
    )
    assert listed.status_code == 200
    assert [category["name"] for category in listed.json()] == ["Comidas", "Bebidas"]

    patched = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories/{bebidas.json()['id']}",
        headers=auth_headers(owner),
        json={"name": "Tragos", "position": 0, "is_visible": False},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Tragos"
    assert patched.json()["position"] == 0
    assert patched.json()["is_visible"] is False

    reordered = client.get(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories",
        headers=auth_headers(owner),
    )
    assert [category["name"] for category in reordered.json()] == ["Tragos", "Comidas"]

    forbidden = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories/{bebidas.json()['id']}",
        headers=auth_headers(outsider),
        json={"name": "Hack"},
    )
    assert forbidden.status_code == 403

    deleted = client.delete(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories/{comida.json()['id']}",
        headers=auth_headers(owner),
    )
    assert deleted.status_code == 200

    final_list = client.get(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories",
        headers=auth_headers(owner),
    )
    assert [category["name"] for category in final_list.json()] == ["Tragos"]


def test_item_crud_flags_position_money_and_isolation(client, db: Session) -> None:
    owner = make_user(db, "item-owner@example.com")
    outsider = make_user(db, "item-outsider@example.com")
    business = make_business(
        db, "Item Biz", "item-biz", plan_key=BusinessPlanKey.premium
    )
    outsider_business = make_business(
        db, "Item Other", "item-other", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    add_membership(db, outsider, outsider_business, MembershipRole.owner)

    menu = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={"name": "Carta items"},
    ).json()
    category = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories",
        headers=auth_headers(owner),
        json={"name": "Principales", "position": 1},
    ).json()

    milanesa = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories/{category['id']}/items",
        headers=auth_headers(owner),
        json={
            "name": "Milanesa",
            "description": "Con papas",
            "price": "1234.10",
            "currency": "ars",
            "position": 3,
        },
    )
    assert milanesa.status_code == 200
    assert Decimal(str(milanesa.json()["price"])) == Decimal("1234.10")
    assert milanesa.json()["currency"] == "ARS"

    ensalada = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories/{category['id']}/items",
        headers=auth_headers(owner),
        json={"name": "Ensalada", "price": "999.00", "currency": "ARS", "position": 1},
    )
    assert ensalada.status_code == 200

    listed = client.get(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/items",
        headers=auth_headers(owner),
    )
    assert listed.status_code == 200
    assert [item["name"] for item in listed.json()] == ["Ensalada", "Milanesa"]

    patched = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/items/{milanesa.json()['id']}",
        headers=auth_headers(owner),
        json={
            "name": "Milanesa napolitana",
            "description": "Con jamon y queso",
            "price": "1300.50",
            "is_available": False,
            "is_visible": False,
            "is_featured": True,
            "position": 0,
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["name"] == "Milanesa napolitana"
    assert body["description"] == "Con jamon y queso"
    assert Decimal(str(body["price"])) == Decimal("1300.50")
    assert body["is_available"] is False
    assert body["is_visible"] is False
    assert body["is_featured"] is True
    assert body["position"] == 0

    reordered = client.get(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/items",
        headers=auth_headers(owner),
    )
    assert [item["name"] for item in reordered.json()] == ["Milanesa napolitana", "Ensalada"]

    forbidden = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/items/{milanesa.json()['id']}",
        headers=auth_headers(outsider),
        json={"name": "Hack"},
    )
    assert forbidden.status_code == 403

    deleted = client.delete(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/items/{ensalada.json()['id']}",
        headers=auth_headers(owner),
    )
    assert deleted.status_code == 200

    final_items = client.get(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/items",
        headers=auth_headers(owner),
    )
    assert [item["name"] for item in final_items.json()] == ["Milanesa napolitana"]


def test_money_validation_accepts_zero_and_rejects_invalid_precision(client, db: Session) -> None:
    owner = make_user(db, "money-owner@example.com")
    business = make_business(
        db, "Money Biz", "money-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)

    menu = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={"name": "Carta dinero"},
    ).json()
    category = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories",
        headers=auth_headers(owner),
        json={"name": "Postres"},
    ).json()

    zero_price = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories/{category['id']}/items",
        headers=auth_headers(owner),
        json={"name": "Agua", "price": "0.00", "currency": "ARS"},
    )
    assert zero_price.status_code == 200

    negative = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories/{category['id']}/items",
        headers=auth_headers(owner),
        json={"name": "Error", "price": "-1.00", "currency": "ARS"},
    )
    assert negative.status_code == 422

    precision = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories/{category['id']}/items",
        headers=auth_headers(owner),
        json={"name": "Error 2", "price": "10.999", "currency": "ARS"},
    )
    assert precision.status_code == 422


def test_switching_business_to_digital_menu_keeps_public_code_and_serves_public_payload(
    client, db: Session
) -> None:
    owner = make_user(db, "public-menu-owner@example.com")
    business = make_business(
        db, "Public Menu Biz", "public-menu-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)

    external = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(owner),
        json={
            "destination_type": "external_url",
            "external_url": "https://ejemplo.com/menu",
        },
    )
    assert external.status_code == 200
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None
    original_code = link.public_code

    menu = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={
            "name": "Carta publica",
            "template_key": "modern",
        },
    )
    assert menu.status_code == 200
    menu_payload = menu.json()
    category = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_payload['id']}/categories",
        headers=auth_headers(owner),
        json={"name": "Destacados", "position": 0},
    ).json()
    item = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_payload['id']}/categories/{category['id']}/items",
        headers=auth_headers(owner),
        json={
            "name": "Empanada",
            "description": "Carne cortada a cuchillo",
            "price": "1500.00",
            "currency": "ARS",
            "position": 0,
            "is_featured": True,
        },
    )
    assert item.status_code == 200
    _publish_menu(client, business.id, menu_payload["id"], auth_headers(owner))

    switched = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(owner),
        json={"destination_type": "digital_menu"},
    )
    assert switched.status_code == 200
    assert switched.json()["destination_type"] == "digital_menu"

    db.expire(link)
    assert link.public_code == original_code
    assert link.destination_type == DestinationType.digital_menu

    redirect = client.get(f"/r/{original_code}")
    assert redirect.status_code == 302
    assert redirect.headers["location"] == f"/m/{original_code}"

    public_menu = client.get(f"/api/public/digital-menus/{original_code}")
    assert public_menu.status_code == 200
    public_body = public_menu.json()
    assert public_body["business"]["name"] == "Public Menu Biz"
    assert public_body["menu"]["name"] == "Carta publica"
    assert public_body["categories"][0]["name"] == "Destacados"
    assert public_body["categories"][0]["items"][0]["name"] == "Empanada"

    refreshed_business = db.get(Business, business.id)
    assert refreshed_business is not None
    assert refreshed_business.destination_type == DestinationType.digital_menu


def test_public_digital_menu_page_filters_hidden_content_and_keeps_safe_states(
    client, db: Session
) -> None:
    owner = make_user(db, "public-page-owner@example.com")
    business = make_business(
        db, "Public Page Biz", "public-page-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)

    menu = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={
            "name": "Carta publica",
            "template_key": "modern",
        },
    )
    assert menu.status_code == 200
    menu_payload = menu.json()

    mains = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_payload['id']}/categories",
        headers=auth_headers(owner),
        json={"name": "Principales", "description": "Platos fuertes", "position": 2},
    ).json()
    drinks = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_payload['id']}/categories",
        headers=auth_headers(owner),
        json={"name": "Bebidas", "position": 1},
    ).json()
    hidden = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_payload['id']}/categories",
        headers=auth_headers(owner),
        json={"name": "Secretos", "position": 0, "is_visible": False},
    ).json()

    assert (
        client.post(
            f"/api/businesses/{business.id}/digital-menu/{menu_payload['id']}/categories/{drinks['id']}/items",
            headers=auth_headers(owner),
            json={
                "name": "Agua con gas",
                "price": "1800.00",
                "currency": "ARS",
                "position": 1,
                "is_available": False,
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/businesses/{business.id}/digital-menu/{menu_payload['id']}/categories/{drinks['id']}/items",
            headers=auth_headers(owner),
            json={
                "name": "Limonada",
                "price": "2200.00",
                "currency": "ARS",
                "position": 0,
                "is_featured": True,
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/businesses/{business.id}/digital-menu/{menu_payload['id']}/categories/{mains['id']}/items",
            headers=auth_headers(owner),
            json={
                "name": "Milanesa napolitana",
                "description": "Con papas",
                "price": "9500.00",
                "currency": "ARS",
                "position": 0,
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/businesses/{business.id}/digital-menu/{menu_payload['id']}/categories/{mains['id']}/items",
            headers=auth_headers(owner),
            json={
                "name": "Oculto",
                "price": "100.00",
                "currency": "ARS",
                "position": 99,
                "is_visible": False,
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/businesses/{business.id}/digital-menu/{menu_payload['id']}/categories/{hidden['id']}/items",
            headers=auth_headers(owner),
            json={
                "name": "Nunca publico",
                "price": "500.00",
                "currency": "ARS",
                "position": 0,
            },
        ).status_code
        == 200
    )
    _publish_menu(client, business.id, menu_payload["id"], auth_headers(owner))

    switched = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(owner),
        json={"destination_type": "digital_menu"},
    )
    assert switched.status_code == 200

    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None

    response = client.get(f"/api/public/digital-menus/{link.public_code}")
    assert response.status_code == 200
    body = response.json()
    assert body["business"]["name"] == "Public Page Biz"
    assert body["menu"]["name"] == "Carta publica"
    assert [category["name"] for category in body["categories"]] == ["Bebidas", "Principales"]
    assert [item["name"] for item in body["categories"][0]["items"]] == [
        "Limonada",
        "Agua con gas",
    ]
    assert body["categories"][0]["items"][0]["is_featured"] is True
    assert body["categories"][0]["items"][1]["is_available"] is False
    assert [item["name"] for item in body["categories"][1]["items"]] == [
        "Milanesa napolitana"
    ]

    legacy_payload = client.get(f"/m/{link.public_code}/digital-menu")
    assert legacy_payload.status_code == 200
    assert [category["name"] for category in legacy_payload.json()["categories"]] == [
        "Bebidas",
        "Principales",
    ]


def test_public_digital_menu_page_returns_safe_unavailable_message_when_menu_cannot_be_served(
    client, db: Session
) -> None:
    owner = make_user(db, "public-page-safe-owner@example.com")
    business = make_business(
        db,
        "Unavailable Public Page Biz",
        "unavailable-public-page-biz",
        plan_key=BusinessPlanKey.premium,
    )
    add_membership(db, owner, business, MembershipRole.owner)

    menu = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={"name": "Carta oculta"},
    )
    assert menu.status_code == 200

    switched = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(owner),
        json={"destination_type": "digital_menu"},
    )
    assert switched.status_code == 200

    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None

    response = client.get(f"/api/public/digital-menus/{link.public_code}")
    assert response.status_code == 403
    assert response.text == "Este menú no se encuentra disponible actualmente."


def test_premium_business_can_upload_jpeg_png_and_webp_product_images(
    client, db: Session
) -> None:
    owner = make_user(db, "item-image-owner@example.com")
    business = make_business(
        db, "Item Image Biz", "item-image-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    headers = auth_headers(owner)
    menu_id, category_id = _create_menu_with_category(client, business.id, headers)
    item = _create_menu_item(client, business.id, menu_id, category_id, headers)

    formats = [
        ("producto.jpg", "image/jpeg", _image_bytes(format_name="JPEG")),
        ("producto.png", "image/png", _image_bytes(format_name="PNG")),
        ("producto.webp", "image/webp", _image_bytes(format_name="WEBP")),
    ]
    for filename, content_type, content in formats:
        response = client.post(
            f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
            headers=headers,
            files=_image_upload(filename, content, content_type),
        )
        assert response.status_code == 200


def test_draft_preview_publish_flow_keeps_public_snapshot_stable(client, db: Session) -> None:
    owner = make_user(db, "draft-preview-owner@example.com")
    business = make_business(
        db, "Draft Preview Biz", "draft-preview-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    headers = auth_headers(owner)

    menu = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=headers,
        json={"name": "Carta draft"},
    ).json()
    category = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories",
        headers=headers,
        json={"name": "Principales", "position": 0},
    ).json()
    item = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories/{category['id']}/items",
        headers=headers,
        json={"name": "Milanesa", "price": "1000.00", "currency": "ARS", "position": 0},
    )
    assert item.status_code == 200

    switched = client.patch(
        f"/api/businesses/{business.id}",
        headers=headers,
        json={"destination_type": "digital_menu"},
    )
    assert switched.status_code == 200
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None

    assert client.get(f"/api/public/digital-menus/{link.public_code}").status_code == 403

    preview_v0 = client.get(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/preview",
        headers=headers,
    )
    assert preview_v0.status_code == 200
    assert preview_v0.json()["categories"][0]["items"][0]["price"] == "1000.00"

    published_v1 = _publish_menu(client, business.id, menu["id"], headers)
    assert published_v1["version"] == 1

    public_v1 = client.get(f"/api/public/digital-menus/{link.public_code}")
    assert public_v1.status_code == 200
    assert public_v1.json()["menu"]["published_version"] == 1
    assert public_v1.json()["categories"][0]["items"][0]["price"] == "1000.00"

    price_patch = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/items/{item.json()['id']}",
        headers=headers,
        json={"price": "1200.00"},
    )
    assert price_patch.status_code == 200
    assert price_patch.json()["price"] == "1200.00"

    menu_state = client.get(f"/api/businesses/{business.id}/digital-menu", headers=headers)
    assert menu_state.status_code == 200
    assert menu_state.json()["has_unpublished_changes"] is True
    assert menu_state.json()["published_version"] == 1

    public_still_v1 = client.get(f"/api/public/digital-menus/{link.public_code}")
    assert public_still_v1.status_code == 200
    assert public_still_v1.json()["categories"][0]["items"][0]["price"] == "1000.00"

    preview_v2 = client.get(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/preview",
        headers=headers,
    )
    assert preview_v2.status_code == 200
    assert preview_v2.json()["categories"][0]["items"][0]["price"] == "1200.00"

    published_v2 = _publish_menu(client, business.id, menu["id"], headers)
    assert published_v2["version"] == 2

    public_v2 = client.get(f"/api/public/digital-menus/{link.public_code}")
    assert public_v2.status_code == 200
    assert public_v2.json()["menu"]["published_version"] == 2
    assert public_v2.json()["categories"][0]["items"][0]["price"] == "1200.00"


def test_theme_changes_stay_in_draft_until_publish(client, db: Session) -> None:
    owner = make_user(db, "theme-draft-owner@example.com")
    business = make_business(
        db, "Theme Draft Biz", "theme-draft-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    headers = auth_headers(owner)

    menu = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=headers,
        json={"name": "Carta colores"},
    ).json()
    category = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories",
        headers=headers,
        json={"name": "Principales"},
    ).json()
    assert (
        client.post(
            f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories/{category['id']}/items",
            headers=headers,
            json={"name": "Cafe", "price": "1500.00", "currency": "ARS"},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/businesses/{business.id}",
            headers=headers,
            json={"destination_type": "digital_menu"},
        ).status_code
        == 200
    )
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None

    _publish_menu(client, business.id, menu["id"], headers)
    original_public = client.get(f"/api/public/digital-menus/{link.public_code}")
    assert original_public.status_code == 200
    assert original_public.json()["theme"]["accent_color"] == DEFAULT_THEME["accent_color"]

    theme_patch = client.patch(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}",
        headers=headers,
        json={"theme": {"accent_color": "#1F3A2D", "background_color": "#E8F0EA"}},
    )
    assert theme_patch.status_code == 200

    public_before_republish = client.get(f"/api/public/digital-menus/{link.public_code}")
    assert public_before_republish.json()["theme"]["accent_color"] == DEFAULT_THEME["accent_color"]

    preview = client.get(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/preview",
        headers=headers,
    )
    assert preview.status_code == 200
    assert preview.json()["theme"]["accent_color"] == "#1F3A2D"

    _publish_menu(client, business.id, menu["id"], headers)
    public_after_republish = client.get(f"/api/public/digital-menus/{link.public_code}")
    assert public_after_republish.json()["theme"]["accent_color"] == "#1F3A2D"


def test_replacing_draft_image_keeps_published_image_alive_until_republish(
    client, db: Session
) -> None:
    owner = make_user(db, "image-snapshot-owner@example.com")
    business = make_business(
        db, "Image Snapshot Biz", "image-snapshot-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    headers = auth_headers(owner)

    menu_id, category_id = _create_menu_with_category(client, business.id, headers)
    item = _create_menu_item(client, business.id, menu_id, category_id, headers)
    assert (
        client.patch(
            f"/api/businesses/{business.id}",
            headers=headers,
            json={"destination_type": "digital_menu"},
        ).status_code
        == 200
    )
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None

    first_upload = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
        files=_image_upload(
            "rojo.png",
            _image_bytes(format_name="PNG", color=(255, 0, 0)),
            "image/png",
        ),
    )
    assert first_upload.status_code == 200
    _publish_menu(client, business.id, menu_id, headers)

    public_v1 = client.get(f"/api/public/digital-menus/{link.public_code}")
    image_url_v1 = public_v1.json()["categories"][0]["items"][0]["image_url"]
    image_v1 = client.get(image_url_v1)
    assert image_v1.status_code == 200
    assert _image_center_rgb(image_v1.content)[0] > _image_center_rgb(image_v1.content)[2]

    second_upload = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
        files=_image_upload(
            "azul.png",
            _image_bytes(format_name="PNG", color=(0, 0, 255)),
            "image/png",
        ),
    )
    assert second_upload.status_code == 200

    still_v1 = client.get(f"/api/public/digital-menus/{link.public_code}")
    assert still_v1.json()["categories"][0]["items"][0]["image_url"] == image_url_v1
    image_v1_still = client.get(image_url_v1)
    assert image_v1_still.status_code == 200
    assert _image_center_rgb(image_v1_still.content)[0] > _image_center_rgb(
        image_v1_still.content
    )[2]

    _publish_menu(client, business.id, menu_id, headers)
    public_v2 = client.get(f"/api/public/digital-menus/{link.public_code}")
    image_url_v2 = public_v2.json()["categories"][0]["items"][0]["image_url"]
    assert image_url_v2 != image_url_v1
    image_v2 = client.get(image_url_v2)
    assert image_v2.status_code == 200
    assert _image_center_rgb(image_v2.content)[2] > _image_center_rgb(image_v2.content)[0]


def test_preview_publish_and_unpublish_respect_plan_membership_and_business_status(
    client, db: Session
) -> None:
    owner = make_user(db, "security-owner@example.com")
    outsider = make_user(db, "security-outsider@example.com")
    premium_business = make_business(
        db, "Secure Premium", "secure-premium", plan_key=BusinessPlanKey.premium
    )
    essential_business = make_business(
        db, "Secure Essential", "secure-essential", plan_key=BusinessPlanKey.essential
    )
    add_membership(db, owner, premium_business, MembershipRole.owner)
    add_membership(db, owner, essential_business, MembershipRole.owner)
    outsider_business = make_business(
        db, "Other Tenant", "other-tenant", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, outsider, outsider_business, MembershipRole.owner)

    premium_headers = auth_headers(owner)
    essential_headers = auth_headers(owner)
    outsider_headers = auth_headers(outsider)

    premium_menu = client.post(
        f"/api/businesses/{premium_business.id}/digital-menu",
        headers=premium_headers,
        json={"name": "Carta segura"},
    ).json()
    category = client.post(
        f"/api/businesses/{premium_business.id}/digital-menu/{premium_menu['id']}/categories",
        headers=premium_headers,
        json={"name": "Principales"},
    ).json()
    assert (
        client.post(
            f"/api/businesses/{premium_business.id}/digital-menu/{premium_menu['id']}/categories/{category['id']}/items",
            headers=premium_headers,
            json={"name": "Plato", "price": "1000.00", "currency": "ARS"},
        ).status_code
        == 200
    )

    essential_menu = client.post(
        f"/api/businesses/{essential_business.id}/digital-menu",
        headers=essential_headers,
        json={"name": "Carta esencial"},
    )
    assert essential_menu.status_code == 403

    preview_ok = client.get(
        f"/api/businesses/{premium_business.id}/digital-menu/{premium_menu['id']}/preview",
        headers=premium_headers,
    )
    assert preview_ok.status_code == 200

    preview_forbidden = client.get(
        f"/api/businesses/{premium_business.id}/digital-menu/{premium_menu['id']}/preview",
        headers=outsider_headers,
    )
    assert preview_forbidden.status_code == 403

    publish_ok = client.post(
        f"/api/businesses/{premium_business.id}/digital-menu/{premium_menu['id']}/publish",
        headers=premium_headers,
    )
    assert publish_ok.status_code == 200

    premium_business.status = BusinessStatus.suspended
    db.commit()
    suspended_publish = client.post(
        f"/api/businesses/{premium_business.id}/digital-menu/{premium_menu['id']}/publish",
        headers=premium_headers,
    )
    assert suspended_publish.status_code == 403

    premium_business.status = BusinessStatus.active
    db.commit()
    unpublish_ok = client.post(
        f"/api/businesses/{premium_business.id}/digital-menu/{premium_menu['id']}/unpublish",
        headers=premium_headers,
    )
    assert unpublish_ok.status_code == 200


def test_essential_business_cannot_upload_product_images(client, db: Session) -> None:
    owner = make_user(db, "essential-item-image-owner@example.com")
    business = make_business(db, "Essential Image Biz", "essential-image-biz")
    add_membership(db, owner, business, MembershipRole.owner)
    headers = auth_headers(owner)

    premium_source = make_business(
        db, "Premium Image Source", "premium-image-source", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, premium_source, MembershipRole.owner)
    menu_id, category_id = _create_menu_with_category(client, premium_source.id, headers)
    item = _create_menu_item(client, premium_source.id, menu_id, category_id, headers)

    blocked = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
        files=_image_upload("producto.jpg", _image_bytes(format_name="JPEG"), "image/jpeg"),
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Feature not enabled: digital_menu"


def test_other_tenant_cannot_upload_or_delete_foreign_product_images(client, db: Session) -> None:
    owner_a = make_user(db, "tenant-a-image@example.com")
    owner_b = make_user(db, "tenant-b-image@example.com")
    business_a = make_business(
        db, "Tenant A Images", "tenant-a-images", plan_key=BusinessPlanKey.premium
    )
    business_b = make_business(
        db, "Tenant B Images", "tenant-b-images", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner_a, business_a, MembershipRole.owner)
    add_membership(db, owner_b, business_b, MembershipRole.owner)

    menu_a, category_a = _create_menu_with_category(client, business_a.id, auth_headers(owner_a))
    item_a = _create_menu_item(
        client, business_a.id, menu_a, category_a, auth_headers(owner_a), name="Ajeno"
    )
    menu_b, _ = _create_menu_with_category(client, business_b.id, auth_headers(owner_b))

    blocked_upload = client.post(
        f"/api/businesses/{business_b.id}/digital-menu/{menu_b}/items/{item_a['id']}/image",
        headers=auth_headers(owner_b),
        files=_image_upload("producto.jpg", _image_bytes(format_name="JPEG"), "image/jpeg"),
    )
    assert blocked_upload.status_code == 404

    blocked_delete = client.delete(
        f"/api/businesses/{business_b.id}/digital-menu/{menu_b}/items/{item_a['id']}/image",
        headers=auth_headers(owner_b),
    )
    assert blocked_delete.status_code == 404


def test_product_image_upload_validation_and_failure_do_not_alter_item(client, db: Session) -> None:
    owner = make_user(db, "item-image-validation@example.com")
    business = make_business(
        db, "Item Validation Biz", "item-validation-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    headers = auth_headers(owner)
    menu_id, category_id = _create_menu_with_category(client, business.id, headers)
    item = _create_menu_item(
        client, business.id, menu_id, category_id, headers, name="Milanesa", price="9999.00"
    )

    too_large = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
        files=_image_upload("huge.jpg", b"x" * (10 * 1024 * 1024 + 1), "image/jpeg"),
    )
    assert too_large.status_code == 413

    invalid_type = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
        files=_image_upload("foto.txt", b"hello", "text/plain"),
    )
    assert invalid_type.status_code == 400

    corrupt = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
        files=_image_upload("foto.png", b"not-an-image", "image/png"),
    )
    assert corrupt.status_code == 400

    persisted = db.get(MenuItem, item["id"])
    assert persisted is not None
    assert persisted.name == "Milanesa"
    assert Decimal(str(persisted.price)) == Decimal("9999.00")
    assert persisted.image_key is None
    assert persisted.image_url is None


def test_replacing_product_image_updates_reference_and_failed_replace_keeps_previous_image(
    client, db: Session
) -> None:
    owner = make_user(db, "item-image-replace@example.com")
    business = make_business(
        db, "Replace Image Biz", "replace-image-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    headers = auth_headers(owner)
    menu_id, category_id = _create_menu_with_category(client, business.id, headers)
    item = _create_menu_item(client, business.id, menu_id, category_id, headers)

    first_upload = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
        files=_image_upload("primera.jpg", _image_bytes(format_name="JPEG"), "image/jpeg"),
    )
    assert first_upload.status_code == 200

    first_state = db.get(MenuItem, item["id"])
    assert first_state is not None
    first_key = first_state.image_key
    first_url = first_state.image_url
    assert first_key is not None
    assert first_url is not None
    assert client.get(first_url, headers=headers).status_code == 200

    replaced = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
        files=_image_upload(
            "segunda.png",
            _image_bytes(format_name="PNG", color=(25, 180, 110)),
            "image/png",
        ),
    )
    assert replaced.status_code == 200

    second_state = db.get(MenuItem, item["id"])
    assert second_state is not None
    assert second_state.image_key is not None
    assert second_state.image_key != first_key
    assert second_state.image_url == first_url
    assert client.get(second_state.image_url, headers=headers).status_code == 200
    with pytest.raises(FileNotFoundError):
        LocalStorage().open(first_key)

    failed_replace = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
        files=_image_upload("rota.png", b"bad-image", "image/png"),
    )
    assert failed_replace.status_code == 400

    final_state = db.get(MenuItem, item["id"])
    assert final_state is not None
    assert final_state.image_key == second_state.image_key
    assert final_state.image_url == second_state.image_url
    assert client.get(final_state.image_url, headers=headers).status_code == 200


def test_delete_product_image_clears_reference_and_keeps_item(client, db: Session) -> None:
    owner = make_user(db, "item-image-delete@example.com")
    business = make_business(
        db, "Delete Image Biz", "delete-image-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    headers = auth_headers(owner)
    menu_id, category_id = _create_menu_with_category(client, business.id, headers)
    item = _create_menu_item(client, business.id, menu_id, category_id, headers)

    uploaded = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
        files=_image_upload("foto.webp", _image_bytes(format_name="WEBP"), "image/webp"),
    )
    assert uploaded.status_code == 200
    image_url = uploaded.json()["image_url"]

    deleted = client.delete(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
    )
    assert deleted.status_code == 200
    assert deleted.json()["image_url"] is None

    persisted = db.get(MenuItem, item["id"])
    assert persisted is not None
    assert persisted.name == "Producto"
    assert persisted.image_key is None
    assert persisted.image_url is None
    assert client.get(image_url, headers=headers).status_code == 404


def test_product_image_processing_optimizes_output_and_strips_exif_metadata(
    client, db: Session
) -> None:
    owner = make_user(db, "item-image-processing@example.com")
    business = make_business(
        db, "Processing Image Biz", "processing-image-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    headers = auth_headers(owner)
    menu_id, category_id = _create_menu_with_category(client, business.id, headers)
    item = _create_menu_item(client, business.id, menu_id, category_id, headers)

    uploaded = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item['id']}/image",
        headers=headers,
        files=_image_upload(
            "orientada.jpg",
            _image_bytes(
                format_name="JPEG",
                size=(2400, 1200),
                with_exif_orientation=True,
            ),
            "image/jpeg",
        ),
    )
    assert uploaded.status_code == 200

    persisted = db.get(MenuItem, item["id"])
    assert persisted is not None
    assert persisted.image_key is not None
    stored_path = LocalStorage().open(persisted.image_key)
    original_size = len(
        _image_bytes(format_name="JPEG", size=(2400, 1200), with_exif_orientation=True)
    )
    final_size = stored_path.stat().st_size
    assert final_size < original_size

    with Image.open(stored_path) as optimized:
        assert optimized.format == "WEBP"
        assert max(optimized.width, optimized.height) <= 1200
        assert optimized.height >= optimized.width
        assert optimized.info.get("exif") is None


def test_essential_business_cannot_use_private_digital_menu_endpoints(client, db: Session) -> None:
    owner = make_user(db, "essential-owner@example.com")
    business = make_business(db, "Essential Biz", "essential-biz")
    premium_business = make_business(
        db, "Premium Source Biz", "premium-source-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)
    add_membership(db, owner, premium_business, MembershipRole.owner)

    premium_headers = auth_headers(owner)
    menu_id, category_id = _create_menu_with_category(client, premium_business.id, premium_headers)
    item = client.post(
        f"/api/businesses/{premium_business.id}/digital-menu/{menu_id}/categories/{category_id}/items",
        headers=premium_headers,
        json={"name": "Milanesa", "price": "1000.00", "currency": "ARS"},
    )
    assert item.status_code == 200
    item_id = item.json()["id"]

    responses = [
        client.post(
            f"/api/businesses/{business.id}/digital-menu",
            headers=auth_headers(owner),
            json={"name": "Carta bloqueada"},
        ),
        client.get(
            f"/api/businesses/{business.id}/digital-menu",
            headers=auth_headers(owner),
        ),
        client.post(
            f"/api/businesses/{business.id}/digital-menu/{menu_id}/categories",
            headers=auth_headers(owner),
            json={"name": "Bebidas"},
        ),
        client.post(
            f"/api/businesses/{business.id}/digital-menu/{menu_id}/categories/{category_id}/items",
            headers=auth_headers(owner),
            json={"name": "Coca", "price": "1500.00", "currency": "ARS"},
        ),
        client.patch(
            f"/api/businesses/{business.id}",
            headers=auth_headers(owner),
            json={"destination_type": "digital_menu"},
        ),
    ]

    for response in responses:
        assert response.status_code == 403
        assert response.json()["detail"] == "Feature not enabled: digital_menu"

    private_read = client.get(
        f"/api/businesses/{premium_business.id}/digital-menu/{menu_id}/categories",
        headers=auth_headers(owner),
    )
    assert private_read.status_code == 200

    essential_read = client.get(
        f"/api/businesses/{business.id}/digital-menu/{menu_id}/items/{item_id}",
        headers=auth_headers(owner),
    )
    assert essential_read.status_code == 405


def test_platform_admin_can_change_plan_but_owner_cannot(client, db: Session) -> None:
    owner = make_user(db, "plan-owner@example.com")
    admin = make_user(db, "plan-admin@example.com", admin=True)
    business = make_business(db, "Plan Biz", "plan-biz")
    add_membership(db, owner, business, MembershipRole.owner)

    owner_patch = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(owner),
        json={"plan_key": "premium"},
    )
    assert owner_patch.status_code == 403
    assert owner_patch.json()["detail"] == "Forbidden"

    admin_patch = client.patch(
        f"/admin/businesses/{business.id}",
        headers=auth_headers(admin),
        json={"plan_key": "premium"},
    )
    assert admin_patch.status_code == 200
    assert admin_patch.json()["plan_key"] == "premium"
    assert admin_patch.json()["features"]["digital_menu"] is True


def test_admin_downgrade_from_premium_uses_external_url_when_available(
    client, db: Session
) -> None:
    owner = make_user(db, "downgrade-owner@example.com")
    admin = make_user(db, "downgrade-admin@example.com", admin=True)
    business = make_business(
        db, "Downgrade Biz", "downgrade-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)

    external = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(owner),
        json={
            "destination_type": "external_url",
            "external_url": "https://ejemplo.com/menu",
        },
    )
    assert external.status_code == 200

    menu = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={"name": "Carta premium"},
    )
    assert menu.status_code == 200

    switched = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(owner),
        json={"destination_type": "digital_menu"},
    )
    assert switched.status_code == 200

    downgraded = client.patch(
        f"/admin/businesses/{business.id}",
        headers=auth_headers(admin),
        json={"plan_key": "essential"},
    )
    assert downgraded.status_code == 200
    assert downgraded.json()["plan_key"] == "essential"
    assert downgraded.json()["destination_type"] == "external_url"
    assert downgraded.json()["features"]["digital_menu"] is False


def test_admin_downgrade_from_premium_uses_active_pdf_when_no_external_url(
    client, db: Session
) -> None:
    owner = make_user(db, "pdf-owner@example.com")
    admin = make_user(db, "pdf-admin@example.com", admin=True)
    business = make_business(
        db, "PDF Downgrade Biz", "pdf-downgrade-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)

    uploaded = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=_pdf_upload(),
    )
    assert uploaded.status_code == 200
    uploaded_asset_id = uploaded.json()["current"]["id"]
    public_code = uploaded.json()["public_code"]

    menu = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={"name": "Carta premium"},
    )
    assert menu.status_code == 200

    switched = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(owner),
        json={"destination_type": "digital_menu"},
    )
    assert switched.status_code == 200

    downgraded = client.patch(
        f"/admin/businesses/{business.id}",
        headers=auth_headers(admin),
        json={"plan_key": "essential"},
    )
    assert downgraded.status_code == 200
    assert downgraded.json()["destination_type"] == "menu_pdf"
    assert downgraded.json()["features"]["digital_menu"] is False

    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None
    assert link.destination_type == DestinationType.menu_pdf
    assert link.destination_id == uploaded_asset_id
    assert link.public_code == public_code

    redirect = client.get(f"/r/{public_code}")
    assert redirect.status_code == 302
    assert redirect.headers["location"] == f"/m/{public_code}/menu.pdf"


def test_admin_downgrade_from_premium_without_external_url_or_pdf_stays_safe(
    client, db: Session
) -> None:
    owner = make_user(db, "safe-owner@example.com")
    admin = make_user(db, "safe-admin@example.com", admin=True)
    business = make_business(
        db, "Safe Downgrade Biz", "safe-downgrade-biz", plan_key=BusinessPlanKey.premium
    )
    add_membership(db, owner, business, MembershipRole.owner)

    menu = client.post(
        f"/api/businesses/{business.id}/digital-menu",
        headers=auth_headers(owner),
        json={"name": "Carta premium"},
    )
    assert menu.status_code == 200
    menu_id = menu.json()["id"]

    switched = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(owner),
        json={"destination_type": "digital_menu"},
    )
    assert switched.status_code == 200

    link_before = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link_before is not None
    public_code = link_before.public_code

    downgraded = client.patch(
        f"/admin/businesses/{business.id}",
        headers=auth_headers(admin),
        json={"plan_key": "essential"},
    )
    assert downgraded.status_code == 200
    assert downgraded.json()["plan_key"] == "essential"
    assert downgraded.json()["destination_type"] == "digital_menu"
    assert downgraded.json()["features"]["digital_menu"] is False

    link_after = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link_after is not None
    assert link_after.public_code == public_code
    assert link_after.destination_type == DestinationType.digital_menu
    assert link_after.destination_id == menu_id

    redirect = client.get(f"/r/{public_code}")
    assert redirect.status_code == 403
    assert redirect.text == "Este menú no se encuentra disponible actualmente."
