from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Business, DestinationType, DynamicLink, MembershipRole
from tests.conftest import add_membership, auth_headers, make_business, make_user


def test_owner_can_create_and_read_digital_menu(client, db: Session) -> None:
    owner = make_user(db, "menu-owner@example.com")
    outsider = make_user(db, "menu-outsider@example.com")
    business = make_business(db, "Menu Biz", "menu-biz")
    outsider_business = make_business(db, "Other Biz", "other-biz")
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


def test_category_crud_order_visibility_and_isolation(client, db: Session) -> None:
    owner = make_user(db, "category-owner@example.com")
    outsider = make_user(db, "category-outsider@example.com")
    business = make_business(db, "Category Biz", "category-biz")
    outsider_business = make_business(db, "Category Other", "category-other")
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
    business = make_business(db, "Item Biz", "item-biz")
    outsider_business = make_business(db, "Item Other", "item-other")
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
    business = make_business(db, "Money Biz", "money-biz")
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
    business = make_business(db, "Public Menu Biz", "public-menu-biz")
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
            "status": "published",
            "is_published": True,
        },
    ).json()
    category = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories",
        headers=auth_headers(owner),
        json={"name": "Destacados", "position": 0},
    ).json()
    item = client.post(
        f"/api/businesses/{business.id}/digital-menu/{menu['id']}/categories/{category['id']}/items",
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
    assert redirect.headers["location"] == f"/m/{original_code}/digital-menu"

    public_menu = client.get(redirect.headers["location"])
    assert public_menu.status_code == 200
    public_body = public_menu.json()
    assert public_body["name"] == "Carta publica"
    assert public_body["categories"][0]["name"] == "Destacados"
    assert public_body["categories"][0]["items"][0]["name"] == "Empanada"

    refreshed_business = db.get(Business, business.id)
    assert refreshed_business is not None
    assert refreshed_business.destination_type == DestinationType.digital_menu
