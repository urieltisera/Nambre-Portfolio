from base64 import b64decode
from io import BytesIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    BusinessStatus,
    DynamicLink,
    MembershipRole,
    MenuAsset,
    MenuAssetStatus,
    ScanEvent,
)
from app.services.qr_service import qr_payload
from tests.conftest import add_membership, auth_headers, make_business, make_user

PDF_V1 = b"%PDF-1.4\n%v1\n%%EOF\n"
PDF_V2 = b"%PDF-1.4\n%v2\n%%EOF\n"
PNG_LOGO = b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


def pdf_file(content: bytes, name: str = "menu.pdf") -> tuple[str, tuple[str, BytesIO, str]]:
    return ("file", (name, BytesIO(content), "application/pdf"))


def test_inactive_user_cannot_login(client, db: Session) -> None:
    make_user(db, "off@example.com", active=False)
    response = client.post(
        "/auth/login", json={"email": "off@example.com", "password": "secret123"}
    )
    assert response.status_code == 401


def test_membership_isolation(client, db: Session) -> None:
    owner_a = make_user(db, "a@example.com")
    manager_a = make_user(db, "manager@example.com")
    outsider = make_user(db, "out@example.com")
    business_a = make_business(db, "A", "a")
    business_b = make_business(db, "B", "b")
    add_membership(db, owner_a, business_a, MembershipRole.owner)
    add_membership(db, manager_a, business_a, MembershipRole.manager)

    assert (
        client.get(f"/api/businesses/{business_b.id}", headers=auth_headers(owner_a)).status_code
        == 403
    )
    assert (
        client.get(f"/api/businesses/{business_b.id}", headers=auth_headers(manager_a)).status_code
        == 403
    )
    assert (
        client.get(f"/api/businesses/{business_a.id}", headers=auth_headers(outsider)).status_code
        == 403
    )


def test_pdf_validation_versioning_and_rollback(client, db: Session) -> None:
    owner = make_user(db, "owner@example.com")
    business = make_business(db, "Bar Central", "bar-central")
    add_membership(db, owner, business, MembershipRole.owner)

    invalid = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files={"file": ("x.txt", BytesIO(b"no"), "text/plain")},
    )
    assert invalid.status_code == 400

    first = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V1, "v1.pdf")],
    )
    assert first.status_code == 200
    second = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V2, "v2.pdf")],
    )
    assert second.status_code == 200
    assets = db.scalars(select(MenuAsset).where(MenuAsset.business_id == business.id)).all()
    assert sorted(asset.version for asset in assets) == [1, 2]
    assert len([asset for asset in assets if asset.status == MenuAssetStatus.active]) == 1
    archived_v1 = next(asset for asset in assets if asset.version == 1)

    rollback = client.post(
        f"/api/businesses/{business.id}/menu/rollback",
        headers=auth_headers(owner),
        json={"menu_asset_id": archived_v1.id},
    )
    assert rollback.status_code == 200
    db.expire_all()
    rolled_back = db.get(MenuAsset, archived_v1.id)
    assert rolled_back is not None
    assert rolled_back.status == MenuAssetStatus.active


def test_dynamic_link_redirect_suspension_and_stable_code(client, db: Session) -> None:
    owner = make_user(db, "owner2@example.com")
    business = make_business(db, "Bar Central", "bar-central-2")
    add_membership(db, owner, business, MembershipRole.owner)
    client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V1, "v1.pdf")],
    )
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None
    code = link.public_code
    response = client.get(f"/r/{code}", headers={"User-Agent": "Mobile Safari"})
    assert response.status_code == 302
    assert response.headers["location"] == f"/m/{code}/menu.pdf"
    assert client.get(f"/m/{code}/menu.pdf").status_code == 200
    assert db.scalar(select(ScanEvent).where(ScanEvent.business_id == business.id)) is not None

    client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V2, "v2.pdf")],
    )
    db.expire(link)
    assert link.public_code == code

    business.status = BusinessStatus.suspended
    db.commit()
    suspended = client.get(f"/r/{code}")
    assert suspended.status_code == 403
    assert "no se encuentra disponible" in suspended.text
    assert client.get(f"/m/{code}/menu.pdf").status_code == 403
    assert client.get("/r/not-real").status_code == 404
    assert client.get("/m/not-real/menu.pdf").status_code == 404


def test_qr_payload_and_analytics_tenant_isolation(client, db: Session) -> None:
    owner = make_user(db, "owner3@example.com")
    other_owner = make_user(db, "other@example.com")
    business = make_business(db, "Bar Central", "bar-central-3")
    other = make_business(db, "Other", "other")
    add_membership(db, owner, business, MembershipRole.owner)
    add_membership(db, other_owner, other, MembershipRole.owner)
    client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V1, "v1.pdf")],
    )
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None
    generated = client.post(
        f"/api/businesses/{business.id}/qr/generate", headers=auth_headers(owner)
    )
    assert generated.status_code == 200
    assert {item["qr_type"] for item in generated.json()} == {"standard", "branded"}
    assert qr_payload(link.public_code) == f"https://menu.example.test/r/{link.public_code}"
    assert "/api/" not in qr_payload(link.public_code)
    for item in generated.json():
        download = client.get(item["asset_url"], headers=auth_headers(owner))
        assert download.status_code == 200
        assert download.content

    client.get(f"/r/{link.public_code}")
    client.get(f"/r/{link.public_code}")
    summary = client.get(
        f"/api/businesses/{business.id}/analytics/summary", headers=auth_headers(owner)
    )
    assert summary.json()["scans_today"] == 2
    other_summary = client.get(
        f"/api/businesses/{other.id}/analytics/summary", headers=auth_headers(other_owner)
    )
    assert other_summary.json()["scans_today"] == 0


def test_full_acceptance_scenario_and_cross_business_write_forbidden(client, db: Session) -> None:
    owner_a = make_user(db, "bar@example.com")
    owner_b = make_user(db, "b@example.com")
    business_a = make_business(db, "Bar Central", "bar-central-full")
    business_b = make_business(db, "Cafe B", "cafe-b")
    add_membership(db, owner_a, business_a, MembershipRole.owner)
    add_membership(db, owner_b, business_b, MembershipRole.owner)

    logo = client.post(
        f"/api/businesses/{business_a.id}/logo",
        headers=auth_headers(owner_a),
        files={"file": ("logo.png", BytesIO(PNG_LOGO), "image/png")},
    )
    assert logo.status_code == 200
    assert logo.json()["logo_url"] == f"/logos/{business_a.id}"

    v1 = client.post(
        f"/api/businesses/{business_a.id}/menu/replace",
        headers=auth_headers(owner_a),
        files=[pdf_file(PDF_V1, "menu-v1.pdf")],
    )
    assert v1.status_code == 200
    assert (
        client.post(
            f"/api/businesses/{business_a.id}/qr/generate", headers=auth_headers(owner_a)
        ).status_code
        == 200
    )
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business_a.id))
    assert link is not None
    code = link.public_code
    assert client.get(f"/r/{code}").headers["location"] == f"/m/{code}/menu.pdf"
    assert b"%v1" in client.get(f"/m/{code}/menu.pdf").content

    forbidden = client.post(
        f"/api/businesses/{business_b.id}/menu/replace",
        headers=auth_headers(owner_a),
        files=[pdf_file(PDF_V2, "attack.pdf")],
    )
    assert forbidden.status_code == 403
    assert db.scalars(select(MenuAsset).where(MenuAsset.business_id == business_b.id)).all() == []

    v2 = client.post(
        f"/api/businesses/{business_a.id}/menu/replace",
        headers=auth_headers(owner_a),
        files=[pdf_file(PDF_V2, "menu-v2.pdf")],
    )
    assert v2.status_code == 200
    db.expire(link)
    assert link.public_code == code
    assert client.get(f"/r/{code}").status_code == 302
    assert b"%v2" in client.get(f"/m/{code}/menu.pdf").content

    analytics = client.get(
        f"/api/businesses/{business_a.id}/analytics/summary", headers=auth_headers(owner_a)
    )
    assert analytics.json()["scans_today"] == 2
    v1_asset = db.scalar(
        select(MenuAsset).where(MenuAsset.business_id == business_a.id, MenuAsset.version == 1)
    )
    assert v1_asset is not None
    client.post(
        f"/api/businesses/{business_a.id}/menu/rollback",
        headers=auth_headers(owner_a),
        json={"menu_asset_id": v1_asset.id},
    )
    db.expire(link)
    assert link.public_code == code
    assert client.get(f"/r/{code}").status_code == 302
    assert b"%v1" in client.get(f"/m/{code}/menu.pdf").content
