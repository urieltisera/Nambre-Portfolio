from io import BytesIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AuditEvent,
    BusinessStatus,
    DestinationType,
    DynamicLink,
    LegalAcceptance,
    LegalDocumentType,
    MembershipRole,
    QRCode,
    UserSession,
)
from tests.conftest import add_membership, auth_headers, make_business, make_user

PDF_V1 = b"%PDF-1.4\n%v1\n%%EOF\n"


def test_legal_acceptance_is_versioned_and_historical(client, db: Session) -> None:
    user = make_user(db, "legal@example.com", password="legal-pass-123")
    business = make_business(db, "Legal Biz", "legal-biz")
    add_membership(db, user, business, MembershipRole.owner)

    login = client.post(
        "/auth/login",
        json={"email": "legal@example.com", "password": "legal-pass-123"},
    )
    assert login.status_code == 403
    assert login.json()["detail"]["code"] == "legal_acceptance_required"
    assert login.json()["detail"]["legal_status"]["requires_acceptance"] is True
    assert set(login.json()["detail"]["legal_status"]["pending_documents"]) == {
        "terms",
        "privacy",
        "acceptable_use",
        "cookies_analytics",
        "ai_policy",
    }

    accepted_login = client.post(
        "/auth/login",
        json={
            "accept_legal": True,
            "email": "legal@example.com",
            "password": "legal-pass-123",
        },
    )
    assert accepted_login.status_code == 200
    headers = {"Authorization": f"Bearer {accepted_login.json()['access_token']}"}

    initial_status = client.get("/api/legal/status", headers=headers)
    assert initial_status.status_code == 200
    assert initial_status.json()["requires_acceptance"] is False

    allowed = client.get(f"/api/businesses/{business.id}", headers=headers)
    assert allowed.status_code == 200

    original_version = "2026-08-21"
    bumped_version = "2026-09-01"
    from app.api import routes

    routes.CURRENT_LEGAL_VERSIONS[LegalDocumentType.terms] = bumped_version
    try:
        bumped_status = client.get("/api/legal/status", headers=headers)
        assert bumped_status.status_code == 200
        assert bumped_status.json()["requires_acceptance"] is True
        assert bumped_status.json()["pending_documents"] == ["terms"]

        reaccepted = client.post(
            "/api/legal/accept",
            headers=headers,
            json={"document_types": ["terms"], "acceptance_method": "ui_checkbox"},
        )
        assert reaccepted.status_code == 200
        assert reaccepted.json()["requires_acceptance"] is False
    finally:
        routes.CURRENT_LEGAL_VERSIONS[LegalDocumentType.terms] = original_version

    acceptances = db.scalars(
        select(LegalAcceptance)
        .where(
            LegalAcceptance.user_id == user.id,
            LegalAcceptance.document_type == LegalDocumentType.terms,
        )
        .order_by(LegalAcceptance.accepted_at.asc())
    ).all()
    assert [item.document_version for item in acceptances] == [original_version, bumped_version]


def test_logout_revokes_login_session_and_audits_it(client, db: Session) -> None:
    user = make_user(db, "logout@example.com", password="logout-pass-123")

    login = client.post(
        "/auth/login",
        json={
            "accept_legal": True,
            "email": "logout@example.com",
            "password": "logout-pass-123",
        },
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert client.get("/api/me", headers=headers).status_code == 200
    assert client.post("/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/me", headers=headers).status_code == 401

    session = db.scalar(select(UserSession).where(UserSession.user_id == user.id))
    assert session is not None
    assert session.revoked_at is not None
    assert session.revoke_reason == "logout"

    audit_events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.actor_user_id == user.id)
        .order_by(AuditEvent.occurred_at.asc())
    ).all()
    event_types = [event.event_type for event in audit_events]
    assert event_types[-2:] == ["auth.login_succeeded", "auth.logout"]
    assert event_types.count("legal.accepted") == 5


def test_staff_can_view_but_cannot_mutate_sensitive_resources(client, db: Session) -> None:
    owner = make_user(db, "owner-staff@example.com")
    staff = make_user(db, "staff@example.com")
    business = make_business(db, "Staff Biz", "staff-biz", BusinessStatus.active)
    add_membership(db, owner, business, MembershipRole.owner)
    add_membership(db, staff, business, MembershipRole.staff)

    accept_owner = client.post("/api/legal/accept", headers=auth_headers(owner), json={})
    accept_staff = client.post("/api/legal/accept", headers=auth_headers(staff), json={})
    assert accept_owner.status_code == 200
    assert accept_staff.status_code == 200

    upload = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files={"file": ("menu.pdf", BytesIO(PDF_V1), "application/pdf")},
    )
    assert upload.status_code == 200

    assert (
        client.get(f"/api/businesses/{business.id}", headers=auth_headers(staff)).status_code == 200
    )
    assert (
        client.get(
            f"/api/businesses/{business.id}/analytics/summary",
            headers=auth_headers(staff),
        ).status_code
        == 200
    )
    assert (
        client.get(f"/api/businesses/{business.id}/qr", headers=auth_headers(staff)).status_code
        == 200
    )

    assert (
        client.patch(
            f"/api/businesses/{business.id}",
            headers=auth_headers(staff),
            json={"name": "Escalated"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/businesses/{business.id}/menu/replace",
            headers=auth_headers(staff),
            files={"file": ("menu.pdf", BytesIO(PDF_V1), "application/pdf")},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/businesses/{business.id}/qr/generate",
            headers=auth_headers(staff),
        ).status_code
        == 403
    )


def test_cross_tenant_qr_asset_download_is_forbidden(client, db: Session) -> None:
    owner_a = make_user(db, "owner-a-security@example.com")
    owner_b = make_user(db, "owner-b-security@example.com")
    business_a = make_business(db, "A Security", "a-security")
    business_b = make_business(db, "B Security", "b-security")
    add_membership(db, owner_a, business_a, MembershipRole.owner)
    add_membership(db, owner_b, business_b, MembershipRole.owner)

    assert (
        client.post("/api/legal/accept", headers=auth_headers(owner_a), json={}).status_code == 200
    )
    assert (
        client.post("/api/legal/accept", headers=auth_headers(owner_b), json={}).status_code == 200
    )
    assert (
        client.post(
            f"/api/businesses/{business_a.id}/menu/replace",
            headers=auth_headers(owner_a),
            files={"file": ("menu.pdf", BytesIO(PDF_V1), "application/pdf")},
        ).status_code
        == 200
    )
    generated = client.post(
        f"/api/businesses/{business_a.id}/qr/generate",
        headers=auth_headers(owner_a),
    )
    assert generated.status_code == 200
    asset_url = next(
        item["asset_url"] for item in generated.json() if item["asset_url"].endswith(".png")
    )

    forbidden = client.get(asset_url, headers=auth_headers(owner_b))
    assert forbidden.status_code == 403


def test_public_redirect_rejects_unsupported_dangerous_destination(client, db: Session) -> None:
    business = make_business(db, "Danger Biz", "danger-biz", BusinessStatus.active)
    link = DynamicLink(
        business_id=business.id,
        public_code="danger-code",
        destination_type=DestinationType.external_url,
        destination_id="javascript:alert(1)",
        is_active=True,
    )
    db.add(link)
    db.commit()

    response = client.get("/r/danger-code")
    assert response.status_code == 404


def test_legal_gate_blocks_admin_endpoints_but_keeps_accept_and_logout_available(
    client, db: Session
) -> None:
    make_user(db, "gate-admin@example.com", password="gate-admin-pass", admin=True)

    login = client.post(
        "/auth/login",
        json={"email": "gate-admin@example.com", "password": "gate-admin-pass"},
    )
    assert login.status_code == 403
    assert login.json()["detail"]["code"] == "legal_acceptance_required"

    accepted_login = client.post(
        "/auth/login",
        json={
            "accept_legal": True,
            "email": "gate-admin@example.com",
            "password": "gate-admin-pass",
        },
    )
    assert accepted_login.status_code == 200
    headers = {"Authorization": f"Bearer {accepted_login.json()['access_token']}"}

    assert client.get("/admin/businesses", headers=headers).status_code == 200
    assert client.post("/auth/logout", headers=headers).status_code == 204


def test_qr_generation_does_not_create_artistic_records_without_real_validation(
    client, db: Session
) -> None:
    owner = make_user(db, "artless@example.com")
    business = make_business(db, "Artless Biz", "artless-biz")
    add_membership(db, owner, business, MembershipRole.owner)

    assert client.post("/api/legal/accept", headers=auth_headers(owner), json={}).status_code == 200
    assert (
        client.post(
            f"/api/businesses/{business.id}/menu/replace",
            headers=auth_headers(owner),
            files={"file": ("menu.pdf", BytesIO(PDF_V1), "application/pdf")},
        ).status_code
        == 200
    )
    generated = client.post(
        f"/api/businesses/{business.id}/qr/generate",
        headers=auth_headers(owner),
    )
    assert generated.status_code == 200
    assert {item["qr_type"] for item in generated.json()} == {"standard", "branded"}

    records = db.scalars(select(QRCode).where(QRCode.business_id == business.id)).all()
    assert all(record.qr_type.value != "artistic" for record in records)
