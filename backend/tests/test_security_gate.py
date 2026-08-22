from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import (
    AcceptanceMethod,
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
from tests.conftest import (
    add_membership,
    auth_headers,
    legacy_auth_headers,
    make_business,
    make_user,
    unaccepted_auth_headers,
)

PDF_V1 = b"%PDF-1.4\n%v1\n%%EOF\n"


def png_1x1() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (1, 1), color=(11, 74, 71)).save(buffer, format="PNG")
    return buffer.getvalue()


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


def test_revoked_session_cannot_be_reused(client, db: Session) -> None:
    user = make_user(db, "revoked@example.com", password="revoked-pass-123")

    login = client.post(
        "/auth/login",
        json={
            "accept_legal": True,
            "email": "revoked@example.com",
            "password": "revoked-pass-123",
        },
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    session = db.scalar(select(UserSession).where(UserSession.user_id == user.id))
    assert session is not None
    session.revoked_at = session.issued_at
    session.revoke_reason = "security-review"
    db.commit()

    reused = client.get("/api/me", headers=headers)
    assert reused.status_code == 401
    assert reused.json()["detail"] == "Session expired"


def test_suspended_user_loses_access_even_with_existing_session(client, db: Session) -> None:
    user = make_user(db, "suspended-user@example.com", password="suspended-pass-123")

    login = client.post(
        "/auth/login",
        json={
            "accept_legal": True,
            "email": "suspended-user@example.com",
            "password": "suspended-pass-123",
        },
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    user.is_active = False
    db.commit()

    blocked = client.get("/api/me", headers=headers)
    assert blocked.status_code == 401
    assert blocked.json()["detail"] == "Inactive or missing user"


def test_legacy_token_cannot_bypass_session_revocation_policy(client, db: Session) -> None:
    user = make_user(db, "legacy@example.com")

    me = client.get("/api/me", headers=legacy_auth_headers(user))
    assert me.status_code == 401
    assert me.json()["detail"] == "Invalid session"


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


def test_manager_cannot_edit_logo_or_rollback_menu(client, db: Session) -> None:
    owner = make_user(db, "owner-manager@example.com")
    manager = make_user(db, "manager-sensitive@example.com")
    business = make_business(db, "Manager Biz", "manager-biz", BusinessStatus.active)
    add_membership(db, owner, business, MembershipRole.owner)
    add_membership(db, manager, business, MembershipRole.manager)

    upload = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files={"file": ("menu.pdf", BytesIO(PDF_V1), "application/pdf")},
    )
    assert upload.status_code == 200
    menu_asset_id = upload.json()["current"]["id"]

    blocked_patch = client.patch(
        f"/api/businesses/{business.id}",
        headers=auth_headers(manager),
        json={"name": "Escalated by manager"},
    )
    assert blocked_patch.status_code == 403

    blocked_logo = client.post(
        f"/api/businesses/{business.id}/logo",
        headers=auth_headers(manager),
        files={"file": ("logo.png", BytesIO(b"fake"), "image/png")},
    )
    assert blocked_logo.status_code == 403

    blocked_rollback = client.post(
        f"/api/businesses/{business.id}/menu/rollback",
        headers=auth_headers(manager),
        json={"menu_asset_id": menu_asset_id},
    )
    assert blocked_rollback.status_code == 403


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


def test_public_redirect_does_not_expose_internal_destination_id(client, db: Session) -> None:
    owner = make_user(db, "public-redirect@example.com")
    business = make_business(db, "Public Redirect Biz", "public-redirect-biz")
    add_membership(db, owner, business, MembershipRole.owner)

    uploaded = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files={"file": ("menu.pdf", BytesIO(PDF_V1), "application/pdf")},
    )
    assert uploaded.status_code == 200
    destination_id = uploaded.json()["current"]["id"]
    public_code = uploaded.json()["public_code"]

    response = client.get(f"/r/{public_code}")
    assert response.status_code == 302
    assert response.headers["location"] == f"/m/{public_code}/menu.pdf"
    assert destination_id not in response.headers["location"]


def test_menu_upload_rejects_empty_pdf(client, db: Session) -> None:
    owner = make_user(db, "empty-pdf@example.com")
    business = make_business(db, "Empty PDF Biz", "empty-pdf-biz")
    add_membership(db, owner, business, MembershipRole.owner)

    response = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files={"file": ("empty.pdf", BytesIO(b""), "application/pdf")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "PDF file is empty"


def test_menu_upload_rejects_spoofed_non_pdf_content(client, db: Session) -> None:
    owner = make_user(db, "fake-pdf@example.com")
    business = make_business(db, "Fake PDF Biz", "fake-pdf-biz")
    add_membership(db, owner, business, MembershipRole.owner)

    response = client.post(
        f"/api/businesses/{business.id}/menu/replace",
        headers=auth_headers(owner),
        files={"file": ("menu.pdf", BytesIO(b"not really a pdf"), "application/pdf")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Uploaded file is not a valid PDF"


def test_logo_upload_rejects_spoofed_non_image_content(client, db: Session) -> None:
    owner = make_user(db, "fake-logo@example.com")
    business = make_business(db, "Fake Logo Biz", "fake-logo-biz")
    add_membership(db, owner, business, MembershipRole.owner)

    response = client.post(
        f"/api/businesses/{business.id}/logo",
        headers=auth_headers(owner),
        files={"file": ("logo.png", BytesIO(b"not really a png"), "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Uploaded file is not a valid image"


def test_logo_upload_accepts_valid_png(client, db: Session) -> None:
    owner = make_user(db, "valid-logo@example.com")
    business = make_business(db, "Valid Logo Biz", "valid-logo-biz")
    add_membership(db, owner, business, MembershipRole.owner)

    response = client.post(
        f"/api/businesses/{business.id}/logo",
        headers=auth_headers(owner),
        files={"file": ("logo.png", BytesIO(png_1x1()), "image/png")},
    )

    assert response.status_code == 200
    assert response.json()["logo_url"] == f"/logos/{business.id}"


def test_login_rate_limit_blocks_repeated_attempts_from_same_client(client, db: Session) -> None:
    make_user(db, "ratelimit@example.com", password="correct-pass-123")

    for _ in range(5):
        response = client.post(
            "/auth/login",
            json={"email": "ratelimit@example.com", "password": "wrong-pass"},
        )
        assert response.status_code == 401

    blocked = client.post(
        "/auth/login",
        json={"email": "ratelimit@example.com", "password": "wrong-pass"},
    )
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "Too many login attempts"


def test_non_local_environment_rejects_default_secret_key() -> None:
    with pytest.raises(ValueError, match="SECRET_KEY must be overridden"):
        Settings(
            environment="production",
            secret_key="replace-with-a-long-random-secret",
        )


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


def test_legal_gate_blocks_direct_api_access_except_status_accept_and_logout(
    client, db: Session
) -> None:
    user = make_user(db, "gate-owner@example.com", password="gate-owner-pass")
    business = make_business(db, "Gate Biz", "gate-biz")
    add_membership(db, user, business, MembershipRole.owner)

    login = client.post(
        "/auth/login",
        json={
            "email": "gate-owner@example.com",
            "password": "gate-owner-pass",
        },
    )
    assert login.status_code == 403

    pending_user = make_user(db, "gate-owner-2@example.com")
    add_membership(db, pending_user, business, MembershipRole.owner)
    gated_headers = unaccepted_auth_headers(pending_user)

    assert client.get("/api/me", headers=gated_headers).status_code == 403
    assert client.get("/api/me/businesses", headers=gated_headers).status_code == 403
    assert client.get(f"/api/businesses/{business.id}", headers=gated_headers).status_code == 403

    transition_user = make_user(db, "gate-owner-3@example.com")
    add_membership(db, transition_user, business, MembershipRole.owner)
    transition_headers = unaccepted_auth_headers(transition_user)

    assert client.get("/api/legal/status", headers=transition_headers).status_code == 200
    assert client.post("/api/legal/accept", headers=transition_headers, json={}).status_code == 200
    assert client.post("/auth/logout", headers=transition_headers).status_code == 204


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


def test_legal_acceptance_global_version_is_db_unique(client, db: Session) -> None:
    user = make_user(db, "dup-legal@example.com")

    first = LegalAcceptance(
        user_id=user.id,
        business_id=None,
        document_type=LegalDocumentType.terms,
        document_version="2026-08-21",
        acceptance_method=AcceptanceMethod.seeded,
    )
    second = LegalAcceptance(
        user_id=user.id,
        business_id=None,
        document_type=LegalDocumentType.terms,
        document_version="2026-08-21",
        acceptance_method=AcceptanceMethod.ui_checkbox,
    )
    db.add(first)
    db.commit()

    db.add(second)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_audit_events_store_actor_scope_and_sanitized_details(client, db: Session) -> None:
    admin = make_user(db, "audit-admin@example.com", admin=True)
    business = make_business(db, "Audit Biz", "audit-biz")

    response = client.patch(
        f"/admin/businesses/{business.id}",
        headers=auth_headers(admin),
        json={"status": "suspended"},
    )
    assert response.status_code == 200

    event = db.scalar(
        select(AuditEvent)
        .where(AuditEvent.event_type == "business.status_changed")
        .order_by(AuditEvent.occurred_at.desc())
    )
    assert event is not None
    assert event.actor_user_id == admin.id
    assert event.business_id == business.id
    assert event.occurred_at is not None
    assert event.details_json is not None
    for secret_fragment in ("password", "Bearer ", "eyJ", "token", "secret", "api_key"):
        assert secret_fragment not in event.details_json
