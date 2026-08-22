import importlib.util
from base64 import b64decode
from collections.abc import Sequence
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from typing import cast
from urllib.parse import parse_qs, urlparse
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import verify_password
from app.models import (
    Business,
    BusinessStatus,
    DestinationType,
    DynamicLink,
    Membership,
    MembershipRole,
    MenuAsset,
    MenuAssetStatus,
    QRCode,
    ScanEvent,
    User,
)
from app.services import analytics_service
from app.services.qr_service import qr_payload
from app.services.user_admin_service import (
    AdminCreationError,
    CreatePlatformAdminResult,
    create_platform_admin,
)
from tests.conftest import add_membership, auth_headers, make_business, make_user

PDF_V1 = b"%PDF-1.4\n%v1\n%%EOF\n"
PDF_V2 = b"%PDF-1.4\n%v2\n%%EOF\n"


def pdf_file(content: bytes, name: str = "menu.pdf") -> tuple[str, tuple[str, BytesIO, str]]:
    return ("file", (name, BytesIO(content), "application/pdf"))


def png_logo_bytes(color: tuple[int, int, int, int] = (255, 0, 0, 255)) -> bytes:
    buffer = BytesIO()
    Image.new("RGBA", (8, 8), color).save(buffer, format="PNG")
    return buffer.getvalue()


PNG_LOGO = png_logo_bytes()


def assert_dynamic_menu_cache_headers(response) -> None:
    assert response.headers["cache-control"] == "no-store, no-cache, must-revalidate"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["expires"] == "0"


def assert_menu_redirect_location(location: str, public_code: str) -> None:
    parsed = urlparse(location)
    assert parsed.path == f"/m/{public_code}/menu.pdf"
    assert parse_qs(parsed.query) == {}


def image_center_pixel(png_bytes: bytes) -> tuple[int, int, int, int]:
    with Image.open(BytesIO(png_bytes)) as image:
        rgba = image.convert("RGBA")
        return cast(tuple[int, int, int, int], rgba.getpixel((rgba.width // 2, rgba.height // 2)))


def svg_embedded_logo_bytes(svg: str) -> bytes:
    root = ET.fromstring(svg)
    image = root.find("{http://www.w3.org/2000/svg}image")
    assert image is not None
    href = image.attrib.get("href") or image.attrib.get("{http://www.w3.org/1999/xlink}href")
    assert href is not None
    prefix = "data:image/png;base64,"
    assert href.startswith(prefix)
    return b64decode(href[len(prefix) :])


def qr_record_signature(records: Sequence[QRCode]) -> set[tuple[str, str, str, str]]:
    return {
        (
            item.id,
            item.qr_type.value,
            Path(item.asset_url).suffix,
            item.asset_url,
        )
        for item in records
    }


def create_dynamic_link(
    db: Session, business_id: str, destination_id: str = "menu-asset"
) -> DynamicLink:
    link = DynamicLink(
        business_id=business_id,
        public_code=f"code-{business_id[:8]}",
        destination_type=DestinationType.menu_pdf,
        destination_id=destination_id,
        is_active=True,
    )
    db.add(link)
    db.commit()
    return link


def create_scan(
    db: Session,
    dynamic_link_id: str,
    business_id: str,
    scanned_at: datetime,
    user_agent_category: str | None = "mobile",
) -> ScanEvent:
    event = ScanEvent(
        dynamic_link_id=dynamic_link_id,
        business_id=business_id,
        scanned_at=scanned_at.astimezone(UTC),
        user_agent_category=user_agent_category,
    )
    db.add(event)
    db.commit()
    return event


def load_script_module(name: str, relative_path: str):
    script_path = Path(__file__).resolve().parents[2] / relative_path
    spec = importlib.util.spec_from_file_location(name, script_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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


def test_create_platform_admin_real_user_and_login(client, db: Session) -> None:
    result = create_platform_admin(db, "Real.Admin@example.com", "real-admin-123")
    assert result == CreatePlatformAdminResult.created

    created_user = db.scalar(select(User).where(User.email == "real.admin@example.com"))
    assert created_user is not None
    assert created_user.is_platform_admin is True
    assert created_user.password_hash != "real-admin-123"
    assert verify_password("real-admin-123", created_user.password_hash)

    login = client.post(
        "/auth/login",
        json={
            "accept_legal": True,
            "email": "Real.Admin@example.com",
            "password": "real-admin-123",
        },
    )
    assert login.status_code == 200
    assert "password" not in login.text.lower()

    me = client.get(
        "/api/me",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json() == {
        "id": created_user.id,
        "email": "real.admin@example.com",
        "is_platform_admin": True,
    }


def test_create_platform_admin_is_idempotent_for_existing_admin(db: Session) -> None:
    first = create_platform_admin(db, "stable-admin@example.com", "first-pass-123")
    assert first == CreatePlatformAdminResult.created
    existing = db.scalar(select(User).where(User.email == "stable-admin@example.com"))
    assert existing is not None
    first_hash = existing.password_hash

    second = create_platform_admin(db, "stable-admin@example.com", "second-pass-456")
    assert second == CreatePlatformAdminResult.existing_admin
    db.refresh(existing)
    assert existing.password_hash == first_hash
    assert verify_password("first-pass-123", existing.password_hash)
    assert not verify_password("second-pass-456", existing.password_hash)


def test_existing_non_admin_is_not_promoted_silently(db: Session) -> None:
    user = make_user(db, "existing-owner@example.com", password="owner-pass-123")
    original_hash = user.password_hash

    with pytest.raises(AdminCreationError, match="explicit promotion"):
        create_platform_admin(db, "existing-owner@example.com", "new-admin-pass")

    db.refresh(user)
    assert user.is_platform_admin is False
    assert user.password_hash == original_hash


def test_create_platform_admin_can_promote_existing_user_only_explicitly(
    client, db: Session
) -> None:
    user = make_user(db, "promote-me@example.com", password="owner-pass-123")

    result = create_platform_admin(
        db,
        "promote-me@example.com",
        "new-admin-pass-123",
        promote_existing=True,
    )
    assert result == CreatePlatformAdminResult.promoted_existing

    db.refresh(user)
    assert user.is_platform_admin is True
    assert verify_password("new-admin-pass-123", user.password_hash)

    login = client.post(
        "/auth/login",
        json={
            "accept_legal": True,
            "email": "promote-me@example.com",
            "password": "new-admin-pass-123",
        },
    )
    assert login.status_code == 200


def test_admin_assign_owner_creates_real_owner_login_and_scope(client, db: Session) -> None:
    admin = make_user(db, "ops-admin@example.com", admin=True)
    business = make_business(db, "Real Biz", "real-biz")
    other_business = make_business(db, "Other Biz", "other-biz")

    assigned = client.post(
        f"/admin/businesses/{business.id}/owner",
        headers=auth_headers(admin),
        json={"email": "owner.real@example.com", "password": "owner-pass-123", "role": "owner"},
    )
    assert assigned.status_code == 200
    assert assigned.json()["email"] == "owner.real@example.com"
    assert assigned.json()["is_platform_admin"] is False
    assert "password" not in assigned.text.lower()

    owner_login = client.post(
        "/auth/login",
        json={
            "accept_legal": True,
            "email": "owner.real@example.com",
            "password": "owner-pass-123",
        },
    )
    assert owner_login.status_code == 200

    owner_headers = {"Authorization": f"Bearer {owner_login.json()['access_token']}"}
    me_owner = client.get("/api/me", headers=owner_headers)
    assert me_owner.status_code == 200
    assert me_owner.json()["is_platform_admin"] is False

    my_businesses = client.get("/api/me/businesses", headers=owner_headers)
    assert my_businesses.status_code == 200
    assert [(item["id"], item["name"]) for item in my_businesses.json()] == [
        (business.id, "Real Biz")
    ]
    assert all(item["id"] != other_business.id for item in my_businesses.json())
    assert client.get("/admin/businesses", headers=owner_headers).status_code == 403


def test_admin_assign_owner_rejects_existing_email_with_different_password(
    client, db: Session
) -> None:
    admin = make_user(db, "conflict-admin@example.com", admin=True)
    owner = make_user(db, "shared-owner@example.com", password="existing-owner-123")
    business = make_business(db, "Conflict Biz", "conflict-biz")

    assigned = client.post(
        f"/admin/businesses/{business.id}/owner",
        headers=auth_headers(admin),
        json={
            "email": "shared-owner@example.com",
            "password": "different-owner-456",
            "role": "owner",
        },
    )
    assert assigned.status_code == 409
    assert assigned.json()["detail"] == "User email already exists with a different password"

    db.refresh(owner)
    assert verify_password("existing-owner-123", owner.password_hash)
    assert not verify_password("different-owner-456", owner.password_hash)
    assert db.scalar(select(Membership).where(Membership.business_id == business.id)) is None


def test_seed_script_keeps_dev_credentials_working(client, db: Session, monkeypatch) -> None:
    seed = load_script_module("seed_script", "scripts/seed.py")
    monkeypatch.setattr(seed, "SessionLocal", lambda: db)

    seed.main()
    seed.main()

    admin_login = client.post(
        "/auth/login",
        json={"accept_legal": True, "email": "admin@example.com", "password": "admin12345"},
    )
    owner_login = client.post(
        "/auth/login",
        json={"accept_legal": True, "email": "owner@example.com", "password": "owner12345"},
    )
    assert admin_login.status_code == 200
    assert owner_login.status_code == 200


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
    assert_menu_redirect_location(response.headers["location"], code)
    assert_dynamic_menu_cache_headers(response)
    menu_response = client.get(response.headers["location"])
    assert menu_response.status_code == 200
    assert menu_response.headers["content-type"].startswith("application/pdf")
    assert menu_response.headers["content-disposition"].startswith("inline;")
    assert_dynamic_menu_cache_headers(menu_response)
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
        f"/api/businesses/{business.id}/logo",
        headers=auth_headers(owner),
        files={"file": ("logo.png", BytesIO(png_logo_bytes()), "image/png")},
    )
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
        assert_dynamic_menu_cache_headers(download)
    payloads = generated.json()
    branded_svg = next(
        item
        for item in payloads
        if item["qr_type"] == "branded" and item["asset_url"].endswith(".svg")
    )
    branded_png = next(
        item
        for item in payloads
        if item["qr_type"] == "branded" and item["asset_url"].endswith(".png")
    )
    standard_png = next(
        item
        for item in payloads
        if item["qr_type"] == "standard" and item["asset_url"].endswith(".png")
    )
    branded_svg_response = client.get(branded_svg["asset_url"], headers=auth_headers(owner))
    assert "data:image/png;base64" in branded_svg_response.text
    branded_png_response = client.get(branded_png["asset_url"], headers=auth_headers(owner))
    standard_png_response = client.get(standard_png["asset_url"], headers=auth_headers(owner))
    assert branded_png_response.content != standard_png_response.content

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


def test_analytics_uses_local_day_boundaries_for_today_and_daily_series(
    db: Session, monkeypatch
) -> None:
    owner = make_user(db, "owner-analytics-boundary@example.com")
    business = make_business(db, "Analytics Boundary", "analytics-boundary")
    add_membership(db, owner, business, MembershipRole.owner)
    link = create_dynamic_link(db, business.id)
    argentina = ZoneInfo("America/Argentina/Buenos_Aires")

    create_scan(db, link.id, business.id, datetime(2026, 8, 19, 23, 59, tzinfo=argentina))
    create_scan(db, link.id, business.id, datetime(2026, 8, 20, 0, 1, tzinfo=argentina))

    monkeypatch.setattr(
        analytics_service,
        "_now_utc",
        lambda: datetime(2026, 8, 20, 0, 5, tzinfo=argentina).astimezone(UTC),
    )

    summary = analytics_service.summary(db, business.id)
    series = analytics_service.daily_series(db, business.id, "7d")
    by_date = {item["date"]: item["scans"] for item in series}

    assert summary["scans_today"] == 1
    assert summary["scans_7d"] == 2
    assert summary["scans_30d"] == 2
    assert by_date["2026-08-19"] == 1
    assert by_date["2026-08-20"] == 1
    assert sum(cast(int, item["scans"]) for item in series) == 2


def test_analytics_groups_utc_boundary_scans_by_local_day_and_local_hour(
    db: Session, monkeypatch
) -> None:
    owner = make_user(db, "owner-analytics-utc-boundary@example.com")
    business = make_business(db, "Analytics UTC Boundary", "analytics-utc-boundary")
    add_membership(db, owner, business, MembershipRole.owner)
    link = create_dynamic_link(db, business.id)
    argentina = ZoneInfo("America/Argentina/Buenos_Aires")

    create_scan(db, link.id, business.id, datetime(2026, 8, 19, 21, 30, tzinfo=argentina))
    create_scan(db, link.id, business.id, datetime(2026, 8, 19, 21, 45, tzinfo=argentina))
    create_scan(db, link.id, business.id, datetime(2026, 8, 20, 0, 1, tzinfo=argentina))

    monkeypatch.setattr(
        analytics_service,
        "_now_utc",
        lambda: datetime(2026, 8, 20, 0, 5, tzinfo=argentina).astimezone(UTC),
    )

    summary = analytics_service.summary(db, business.id)
    series = analytics_service.daily_series(db, business.id, "30d")
    by_date = {item["date"]: item["scans"] for item in series}

    assert summary["scans_today"] == 1
    assert summary["scans_7d"] == 3
    assert summary["scans_30d"] == 3
    assert summary["busiest_hour"] == 21
    assert by_date["2026-08-19"] == 2
    assert by_date["2026-08-20"] == 1
    assert sum(cast(int, item["scans"]) for item in series) == 3


def test_branded_qr_uses_current_logo_after_logo_replacement(client, db: Session) -> None:
    owner = make_user(db, "owner-qr-logo@example.com")
    business = make_business(db, "Logo QR", "logo-qr")
    add_membership(db, owner, business, MembershipRole.owner)

    menu = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V1, "menu.pdf")],
    )
    assert menu.status_code == 200
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None
    public_code = link.public_code

    logo_a = client.post(
        f"/api/businesses/{business.id}/logo",
        headers=auth_headers(owner),
        files={"file": ("logo.png", BytesIO(png_logo_bytes((255, 0, 0, 255))), "image/png")},
    )
    assert logo_a.status_code == 200

    generated_a = client.post(
        f"/api/businesses/{business.id}/qr/generate", headers=auth_headers(owner)
    )
    assert generated_a.status_code == 200
    branded_png_a = client.get(
        next(
            item["asset_url"]
            for item in generated_a.json()
            if item["qr_type"] == "branded" and item["asset_url"].endswith(".png")
        ),
        headers=auth_headers(owner),
    )
    branded_svg_a = client.get(
        next(
            item["asset_url"]
            for item in generated_a.json()
            if item["qr_type"] == "branded" and item["asset_url"].endswith(".svg")
        ),
        headers=auth_headers(owner),
    )
    standard_png_a = client.get(
        next(
            item["asset_url"]
            for item in generated_a.json()
            if item["qr_type"] == "standard" and item["asset_url"].endswith(".png")
        ),
        headers=auth_headers(owner),
    )
    assert branded_png_a.status_code == 200
    assert branded_svg_a.status_code == 200
    assert standard_png_a.status_code == 200
    assert_dynamic_menu_cache_headers(branded_png_a)
    assert_dynamic_menu_cache_headers(branded_svg_a)
    assert_dynamic_menu_cache_headers(standard_png_a)
    assert (
        image_center_pixel(branded_png_a.content)[0] > image_center_pixel(branded_png_a.content)[2]
    )
    embedded_a = svg_embedded_logo_bytes(branded_svg_a.text)
    assert image_center_pixel(embedded_a)[0] > image_center_pixel(embedded_a)[2]

    logo_b = client.post(
        f"/api/businesses/{business.id}/logo",
        headers=auth_headers(owner),
        files={"file": ("logo.png", BytesIO(png_logo_bytes((0, 0, 255, 255))), "image/png")},
    )
    assert logo_b.status_code == 200

    generated_b = client.post(
        f"/api/businesses/{business.id}/qr/generate", headers=auth_headers(owner)
    )
    assert generated_b.status_code == 200
    db.refresh(link)
    assert link.public_code == public_code

    branded_png_b = client.get(
        next(
            item["asset_url"]
            for item in generated_b.json()
            if item["qr_type"] == "branded" and item["asset_url"].endswith(".png")
        ),
        headers=auth_headers(owner),
    )
    branded_svg_b = client.get(
        next(
            item["asset_url"]
            for item in generated_b.json()
            if item["qr_type"] == "branded" and item["asset_url"].endswith(".svg")
        ),
        headers=auth_headers(owner),
    )
    standard_png_b = client.get(
        next(
            item["asset_url"]
            for item in generated_b.json()
            if item["qr_type"] == "standard" and item["asset_url"].endswith(".png")
        ),
        headers=auth_headers(owner),
    )
    assert branded_png_b.status_code == 200
    assert branded_svg_b.status_code == 200
    assert standard_png_b.status_code == 200
    assert branded_png_b.content != branded_png_a.content
    assert branded_svg_b.text != branded_svg_a.text
    assert standard_png_b.content == standard_png_a.content
    assert_dynamic_menu_cache_headers(branded_png_b)
    assert_dynamic_menu_cache_headers(branded_svg_b)
    assert_dynamic_menu_cache_headers(standard_png_b)
    assert (
        image_center_pixel(branded_png_b.content)[2] > image_center_pixel(branded_png_b.content)[0]
    )
    embedded_b = svg_embedded_logo_bytes(branded_svg_b.text)
    assert embedded_b != embedded_a
    assert image_center_pixel(embedded_b)[2] > image_center_pixel(embedded_b)[0]


def test_replacing_menu_pdf_does_not_change_logo_url(client, db: Session) -> None:
    owner = make_user(db, "owner-logo-menu-independence@example.com")
    business = make_business(db, "Logo Independence", "logo-independence")
    add_membership(db, owner, business, MembershipRole.owner)

    logo = client.post(
        f"/api/businesses/{business.id}/logo",
        headers=auth_headers(owner),
        files={"file": ("logo.png", BytesIO(png_logo_bytes((255, 0, 0, 255))), "image/png")},
    )
    assert logo.status_code == 200
    assert logo.json()["logo_url"] == f"/logos/{business.id}"

    first_menu = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V1, "menu-v1.pdf")],
    )
    assert first_menu.status_code == 200

    business_after_first_menu = client.get(
        f"/api/businesses/{business.id}", headers=auth_headers(owner)
    )
    assert business_after_first_menu.status_code == 200
    assert business_after_first_menu.json()["logo_url"] == f"/logos/{business.id}"

    second_menu = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V2, "menu-v2.pdf")],
    )
    assert second_menu.status_code == 200

    business_after_second_menu = client.get(
        f"/api/businesses/{business.id}", headers=auth_headers(owner)
    )
    assert business_after_second_menu.status_code == 200
    assert business_after_second_menu.json()["logo_url"] == f"/logos/{business.id}"


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
    public_logo = client.get(f"/logos/{business_a.id}")
    assert public_logo.status_code == 200
    assert public_logo.headers["cache-control"] == "no-store"

    logo_replace = client.post(
        f"/api/businesses/{business_a.id}/logo",
        headers=auth_headers(owner_a),
        files={"file": ("logo.jpg", BytesIO(png_logo_bytes()), "image/jpg")},
    )
    assert logo_replace.status_code == 200
    logo_dir = Path.cwd() / "storage" / "businesses" / business_a.id / "logo"
    if not logo_dir.exists():
        from app.config import get_settings

        logo_dir = Path(get_settings().storage_path) / "businesses" / business_a.id / "logo"
    stored = sorted(item.name for item in logo_dir.glob("logo.*"))
    assert stored == ["logo.jpg"]

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
    first_redirect = client.get(f"/r/{code}")
    assert_menu_redirect_location(first_redirect.headers["location"], code)
    assert b"%v1" in client.get(first_redirect.headers["location"]).content

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
    second_redirect = client.get(f"/r/{code}")
    assert second_redirect.status_code == 302
    assert_menu_redirect_location(second_redirect.headers["location"], code)
    assert b"%v2" in client.get(second_redirect.headers["location"]).content

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
    rollback_redirect = client.get(f"/r/{code}")
    assert rollback_redirect.status_code == 302
    assert_menu_redirect_location(rollback_redirect.headers["location"], code)
    assert b"%v1" in client.get(rollback_redirect.headers["location"]).content


def test_public_menu_url_serves_current_asset_with_no_store_headers(client, db: Session) -> None:
    owner = make_user(db, "owner-public-menu@example.com")
    business = make_business(db, "Bar Public", "bar-public")
    add_membership(db, owner, business, MembershipRole.owner)

    first = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V1, "menu-v1.pdf")],
    )
    assert first.status_code == 200
    link = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    assert link is not None
    code = link.public_code
    first_asset_id = link.destination_id

    redirect_v1 = client.get(f"/r/{code}")
    assert redirect_v1.status_code == 302
    assert_menu_redirect_location(redirect_v1.headers["location"], code)
    assert_dynamic_menu_cache_headers(redirect_v1)
    menu_v1 = client.get(redirect_v1.headers["location"])
    assert menu_v1.status_code == 200
    assert menu_v1.content == PDF_V1
    assert menu_v1.headers["content-type"].startswith("application/pdf")
    assert menu_v1.headers["content-disposition"].startswith("inline;")
    assert_dynamic_menu_cache_headers(menu_v1)

    second = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V2, "menu-v2.pdf")],
    )
    assert second.status_code == 200
    db.refresh(link)
    assert link.public_code == code
    second_asset_id = link.destination_id
    assert second_asset_id != first_asset_id

    redirect_v2 = client.get(f"/r/{code}")
    assert redirect_v2.status_code == 302
    assert redirect_v2.headers["location"] == redirect_v1.headers["location"]
    assert_menu_redirect_location(redirect_v2.headers["location"], code)
    menu_v2 = client.get(redirect_v2.headers["location"])
    assert menu_v2.status_code == 200
    assert menu_v2.content == PDF_V2
    assert_dynamic_menu_cache_headers(menu_v2)

    stale_cache_buster = client.get(f"/m/{code}/menu.pdf?v={first_asset_id}")
    assert stale_cache_buster.status_code == 200
    assert stale_cache_buster.content == PDF_V2
    assert_dynamic_menu_cache_headers(stale_cache_buster)

    arbitrary_cache_buster = client.get(f"/m/{code}/menu.pdf?v=foo")
    assert arbitrary_cache_buster.status_code == 200
    assert arbitrary_cache_buster.content == PDF_V2
    assert_dynamic_menu_cache_headers(arbitrary_cache_buster)

    rollback = client.post(
        f"/api/businesses/{business.id}/menu/rollback",
        headers=auth_headers(owner),
        json={"menu_asset_id": first_asset_id},
    )
    assert rollback.status_code == 200
    db.refresh(link)
    assert link.public_code == code
    assert link.destination_id == first_asset_id

    redirect_v1_again = client.get(f"/r/{code}")
    assert redirect_v1_again.status_code == 302
    assert redirect_v1_again.headers["location"] == redirect_v2.headers["location"]
    assert_menu_redirect_location(redirect_v1_again.headers["location"], code)
    menu_v1_again = client.get(redirect_v1_again.headers["location"])
    assert menu_v1_again.status_code == 200
    assert menu_v1_again.content == PDF_V1
    assert_dynamic_menu_cache_headers(menu_v1_again)


def test_platform_admin_access_and_owner_forbidden(client, db: Session) -> None:
    admin = make_user(db, "admin@example.com", admin=True)
    owner = make_user(db, "owner-admin-test@example.com")
    business = make_business(db, "Admin Biz", "admin-biz")
    add_membership(db, owner, business, MembershipRole.owner)

    me_admin = client.get("/api/me", headers=auth_headers(admin))
    assert me_admin.status_code == 200
    assert me_admin.json()["is_platform_admin"] is True

    me_owner = client.get("/api/me", headers=auth_headers(owner))
    assert me_owner.status_code == 200
    assert me_owner.json()["is_platform_admin"] is False

    listing = client.get("/admin/businesses", headers=auth_headers(admin))
    assert listing.status_code == 200
    assert any(item["id"] == business.id for item in listing.json())

    created = client.post(
        "/admin/businesses",
        headers=auth_headers(admin),
        json={"name": "Nuevo Negocio", "slug": "nuevo-negocio", "status": "active"},
    )
    assert created.status_code == 200
    created_id = created.json()["id"]

    assigned = client.post(
        f"/admin/businesses/{created_id}/owner",
        headers=auth_headers(admin),
        json={"email": "nuevo-owner@example.com", "password": "owner12345", "role": "owner"},
    )
    assert assigned.status_code == 200

    suspended = client.patch(
        f"/admin/businesses/{created_id}",
        headers=auth_headers(admin),
        json={"status": "suspended"},
    )
    assert suspended.status_code == 200
    assert suspended.json()["status"] == "suspended"

    assert client.get("/admin/businesses", headers=auth_headers(owner)).status_code == 403
    assert (
        client.post(
            "/admin/businesses",
            headers=auth_headers(owner),
            json={"name": "x", "slug": "x", "status": "active"},
        ).status_code
        == 403
    )


def test_platform_admin_lists_all_statuses_and_preserves_assets_when_switching_status(
    client, db: Session
) -> None:
    admin = make_user(db, "admin-list@example.com", admin=True)
    owner = make_user(db, "owner-status@example.com")
    active = make_business(db, "Activo", "activo", BusinessStatus.active)
    demo = make_business(db, "Demo", "demo", BusinessStatus.demo)
    suspended = make_business(db, "Suspendido", "suspendido", BusinessStatus.suspended)
    add_membership(db, owner, demo, MembershipRole.owner)

    upload = client.post(
        f"/api/businesses/{demo.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V1, "demo.pdf")],
    )
    assert upload.status_code == 200
    generated = client.post(f"/api/businesses/{demo.id}/qr/generate", headers=auth_headers(owner))
    assert generated.status_code == 200

    listing = client.get("/admin/businesses", headers=auth_headers(admin))
    assert listing.status_code == 200
    assert [(item["name"], item["status"]) for item in listing.json()] == [
        ("Activo", "active"),
        ("Demo", "demo"),
        ("Suspendido", "suspended"),
    ]

    my_businesses = client.get("/api/me/businesses", headers=auth_headers(admin))
    assert my_businesses.status_code == 200
    assert {item["id"] for item in my_businesses.json()} == {active.id, demo.id, suspended.id}

    link_before = db.scalar(select(DynamicLink).where(DynamicLink.business_id == demo.id))
    qr_before = db.scalars(select(QRCode).where(QRCode.business_id == demo.id)).all()
    assert link_before is not None
    public_code = link_before.public_code
    destination_id = link_before.destination_id
    qr_before_signature = qr_record_signature(qr_before)
    assert {(qr_type, ext) for _, qr_type, ext, _ in qr_before_signature} == {
        ("standard", ".png"),
        ("standard", ".svg"),
        ("branded", ".png"),
        ("branded", ".svg"),
    }

    for next_status in ("active", "suspended", "active"):
        response = client.patch(
            f"/admin/businesses/{demo.id}",
            headers=auth_headers(admin),
            json={"status": next_status},
        )
        assert response.status_code == 200
        assert response.json()["status"] == next_status

    db.expire_all()
    persisted = db.get(Business, demo.id)
    assert persisted is not None
    assert persisted.status == BusinessStatus.active
    link_after = db.scalar(select(DynamicLink).where(DynamicLink.business_id == demo.id))
    qr_after = db.scalars(select(QRCode).where(QRCode.business_id == demo.id)).all()
    assert link_after is not None
    assert link_after.public_code == public_code
    assert link_after.destination_id == destination_id
    assert len(qr_after) == len(qr_before)
    assert qr_record_signature(qr_after) == qr_before_signature


def test_owner_cannot_change_business_status_through_non_admin_endpoints(
    client, db: Session
) -> None:
    owner = make_user(db, "owner-no-status@example.com")
    business = make_business(db, "Owner Biz", "owner-biz", BusinessStatus.demo)
    add_membership(db, owner, business, MembershipRole.owner)

    response = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(owner),
        json={"status": "active"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "demo"

    assert (
        client.patch(
            f"/admin/businesses/{business.id}",
            headers=auth_headers(owner),
            json={"status": "active"},
        ).status_code
        == 403
    )


def test_suspended_business_blocks_owner_mutations_and_recovers_after_reactivation(
    client, db: Session
) -> None:
    admin = make_user(db, "admin-suspended@example.com", admin=True)
    owner = make_user(db, "owner-suspended@example.com")
    business = make_business(db, "Suspension Flow", "suspension-flow", BusinessStatus.active)
    add_membership(db, owner, business, MembershipRole.owner)

    upload = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V1, "menu-v1.pdf")],
    )
    assert upload.status_code == 200
    logo = client.post(
        f"/api/businesses/{business.id}/logo",
        headers=auth_headers(owner),
        files={"file": ("logo.png", BytesIO(png_logo_bytes()), "image/png")},
    )
    assert logo.status_code == 200
    qr_generation = client.post(
        f"/api/businesses/{business.id}/qr/generate",
        headers=auth_headers(owner),
    )
    assert qr_generation.status_code == 200

    link_before = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    qr_before = db.scalars(select(QRCode).where(QRCode.business_id == business.id)).all()
    archived_menu = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V2, "menu-v2.pdf")],
    )
    assert archived_menu.status_code == 200
    menu_assets = db.scalars(
        select(MenuAsset).where(MenuAsset.business_id == business.id).order_by(MenuAsset.version)
    ).all()
    archived_asset = next(
        asset for asset in menu_assets if asset.status == MenuAssetStatus.archived
    )
    assert link_before is not None
    original_public_code = link_before.public_code
    qr_before_signature = qr_record_signature(qr_before)
    assert {(qr_type, ext) for _, qr_type, ext, _ in qr_before_signature} == {
        ("standard", ".png"),
        ("standard", ".svg"),
        ("branded", ".png"),
        ("branded", ".svg"),
    }

    suspended = client.patch(
        f"/admin/businesses/{business.id}",
        headers=auth_headers(admin),
        json={"status": "suspended"},
    )
    assert suspended.status_code == 200

    blocked_logo = client.post(
        f"/api/businesses/{business.id}/logo",
        headers=auth_headers(owner),
        files={"file": ("logo.png", BytesIO(png_logo_bytes((0, 0, 255, 255))), "image/png")},
    )
    assert blocked_logo.status_code == 403
    assert blocked_logo.json()["detail"] == "Business is suspended"

    blocked_replace = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V1, "blocked.pdf")],
    )
    assert blocked_replace.status_code == 403
    assert blocked_replace.json()["detail"] == "Business is suspended"

    blocked_rollback = client.post(
        f"/api/businesses/{business.id}/menu/rollback",
        headers=auth_headers(owner),
        json={"menu_asset_id": archived_asset.id},
    )
    assert blocked_rollback.status_code == 403
    assert blocked_rollback.json()["detail"] == "Business is suspended"

    blocked_qr = client.post(
        f"/api/businesses/{business.id}/qr/generate",
        headers=auth_headers(owner),
    )
    assert blocked_qr.status_code == 403
    assert blocked_qr.json()["detail"] == "Business is suspended"

    safe_redirect = client.get(f"/r/{original_public_code}")
    assert safe_redirect.status_code == 403
    safe_pdf = client.get(f"/m/{original_public_code}/menu.pdf")
    assert safe_pdf.status_code == 403

    reactivated = client.patch(
        f"/admin/businesses/{business.id}",
        headers=auth_headers(admin),
        json={"status": "active"},
    )
    assert reactivated.status_code == 200

    redirect_after = client.get(f"/r/{original_public_code}")
    assert redirect_after.status_code == 302
    db.expire_all()
    link_after = db.scalar(select(DynamicLink).where(DynamicLink.business_id == business.id))
    qr_after = db.scalars(select(QRCode).where(QRCode.business_id == business.id)).all()
    assert link_after is not None
    assert link_after.public_code == original_public_code
    assert len(qr_after) == len(qr_before)
    assert qr_record_signature(qr_after) == qr_before_signature

    recovered_replace = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files=[pdf_file(PDF_V1, "menu-v3.pdf")],
    )
    assert recovered_replace.status_code == 200
