import json
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import verify_password
from app.legal import CURRENT_LEGAL_VERSIONS
from app.models import (
    AuditEvent,
    Business,
    InvitationToken,
    LegalAcceptance,
    Membership,
    MembershipRole,
    User,
)
from app.services import invitation_service
from tests.conftest import auth_headers, make_user


def test_platform_admin_can_invite_client_and_create_pending_records(
    client, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = make_user(db, "admin-invite@example.com", admin=True)
    sent: list[tuple[str, str]] = []

    monkeypatch.setattr(
        invitation_service.secrets,
        "token_urlsafe",
        lambda _size: "known-invitation-token",
    )
    monkeypatch.setattr("app.api.routes.outbound_email_enabled", lambda: True)
    monkeypatch.setattr(
        "app.api.routes.send_invitation_email",
        lambda email, token: sent.append((email, token)),
    )

    response = client.post(
        "/admin/invitations",
        headers=auth_headers(admin),
        json={"business_name": "Cafe Invitado", "email": "owner@invite.com"},
    )

    assert response.status_code == 202
    assert response.json()["email"] == "owner@invite.com"
    assert response.json()["message"] == "Invitación enviada a owner@invite.com"
    assert sent == [("owner@invite.com", "known-invitation-token")]

    business = db.scalar(select(Business).where(Business.slug == "cafe-invitado"))
    assert business is not None
    assert business.name == "Cafe Invitado"

    invited_user = db.scalar(select(User).where(User.email == "owner@invite.com"))
    assert invited_user is not None
    assert invited_user.is_active is False

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == invited_user.id,
            Membership.business_id == business.id,
        )
    )
    assert membership is not None
    assert membership.role == MembershipRole.owner

    invitation = db.scalar(
        select(InvitationToken).where(InvitationToken.user_id == invited_user.id)
    )
    assert invitation is not None
    assert invitation.token_hash == invitation_service.hash_invitation_token(
        "known-invitation-token"
    )
    assert invitation.consumed_at is None

    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.business_id == business.id)
        .order_by(AuditEvent.occurred_at.asc())
    ).all()
    assert [event.event_type for event in events[-2:]] == [
        "invitation.created",
        "invitation.sent",
    ]


def test_non_admin_cannot_invite_client(client, db: Session) -> None:
    owner = make_user(db, "owner-invite@example.com")

    response = client.post(
        "/admin/invitations",
        headers=auth_headers(owner),
        json={"business_name": "Cafe Invitado", "email": "owner@invite.com"},
    )

    assert response.status_code == 403


def test_invited_user_cannot_login_before_activation(
    client, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = make_user(db, "admin-pending@example.com", admin=True)
    monkeypatch.setattr("app.api.routes.outbound_email_enabled", lambda: True)
    monkeypatch.setattr("app.api.routes.send_invitation_email", lambda _email, _token: None)

    invited = client.post(
        "/admin/invitations",
        headers=auth_headers(admin),
        json={"business_name": "Pendiente", "email": "pending@example.com"},
    )
    assert invited.status_code == 202

    login = client.post(
        "/auth/login",
        json={"email": "pending@example.com", "password": "does-not-work"},
    )
    assert login.status_code == 401


def test_valid_invitation_activates_account_and_records_legal_acceptance(
    client, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = make_user(db, "admin-accept@example.com", admin=True)
    monkeypatch.setattr(
        invitation_service.secrets,
        "token_urlsafe",
        lambda _size: "activate-known-token",
    )
    monkeypatch.setattr("app.api.routes.outbound_email_enabled", lambda: True)
    monkeypatch.setattr("app.api.routes.send_invitation_email", lambda _email, _token: None)

    invited = client.post(
        "/admin/invitations",
        headers=auth_headers(admin),
        json={"business_name": "Activable", "email": "activate@example.com"},
    )
    assert invited.status_code == 202

    activation = client.post(
        "/auth/invitations/accept",
        json={
            "token": "activate-known-token",
            "new_password": "new-owner-pass",
            "accept_legal": True,
        },
    )

    assert activation.status_code == 200
    assert activation.json()["message"] == "Tu cuenta fue activada."

    user = db.scalar(select(User).where(User.email == "activate@example.com"))
    assert user is not None
    assert user.is_active is True
    assert verify_password("new-owner-pass", user.password_hash)

    invitation = db.scalar(select(InvitationToken).where(InvitationToken.user_id == user.id))
    assert invitation is not None
    assert invitation.consumed_at is not None

    legal_acceptances = db.scalars(
        select(LegalAcceptance).where(LegalAcceptance.user_id == user.id)
    ).all()
    accepted = {
        (item.document_type.value, item.document_version, item.acceptance_method.value)
        for item in legal_acceptances
    }
    assert accepted == {
        (document_type.value, version, "ui_checkbox")
        for document_type, version in CURRENT_LEGAL_VERSIONS.items()
    }

    accepted_event = db.scalar(
        select(AuditEvent)
        .where(AuditEvent.event_type == "invitation.accepted")
        .order_by(AuditEvent.occurred_at.desc())
    )
    assert accepted_event is not None


def test_invitation_token_is_single_use(
    client, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = make_user(db, "admin-single@example.com", admin=True)
    monkeypatch.setattr(
        invitation_service.secrets,
        "token_urlsafe",
        lambda _size: "single-use-invite-token",
    )
    monkeypatch.setattr("app.api.routes.outbound_email_enabled", lambda: True)
    monkeypatch.setattr("app.api.routes.send_invitation_email", lambda _email, _token: None)

    client.post(
        "/admin/invitations",
        headers=auth_headers(admin),
        json={"business_name": "Single Invite", "email": "single-invite@example.com"},
    )

    first = client.post(
        "/auth/invitations/accept",
        json={
            "token": "single-use-invite-token",
            "new_password": "single-pass-123",
            "accept_legal": True,
        },
    )
    reused = client.post(
        "/auth/invitations/accept",
        json={
            "token": "single-use-invite-token",
            "new_password": "single-pass-456",
            "accept_legal": True,
        },
    )

    assert first.status_code == 200
    assert reused.status_code == 400
    assert reused.json()["detail"] == "Invitation already used"


def test_expired_invitation_is_rejected_and_audited(
    client, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = make_user(db, "admin-expired@example.com", admin=True)
    monkeypatch.setattr(
        invitation_service.secrets,
        "token_urlsafe",
        lambda _size: "expired-invite-token",
    )
    monkeypatch.setattr("app.api.routes.outbound_email_enabled", lambda: True)
    monkeypatch.setattr("app.api.routes.send_invitation_email", lambda _email, _token: None)

    client.post(
        "/admin/invitations",
        headers=auth_headers(admin),
        json={"business_name": "Expired Invite", "email": "expired@example.com"},
    )
    invitation = db.scalar(
        select(InvitationToken).where(
            InvitationToken.token_hash
            == invitation_service.hash_invitation_token("expired-invite-token")
        )
    )
    assert invitation is not None
    invitation.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()

    expired = client.post(
        "/auth/invitations/accept",
        json={
            "token": "expired-invite-token",
            "new_password": "expired-pass-123",
            "accept_legal": True,
        },
    )

    assert expired.status_code == 400
    assert expired.json()["detail"] == "Invitation expired"

    event = db.scalar(
        select(AuditEvent)
        .where(AuditEvent.event_type == "invitation.expired")
        .order_by(AuditEvent.occurred_at.desc())
    )
    assert event is not None
    assert json.loads(event.details_json or "{}")["reason"] == "expired"


def test_duplicate_active_invitation_is_rejected(
    client, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = make_user(db, "admin-duplicate@example.com", admin=True)
    monkeypatch.setattr("app.api.routes.outbound_email_enabled", lambda: True)
    monkeypatch.setattr("app.api.routes.send_invitation_email", lambda _email, _token: None)

    first = client.post(
        "/admin/invitations",
        headers=auth_headers(admin),
        json={"business_name": "Cafe Uno", "email": "dup@example.com"},
    )
    second = client.post(
        "/admin/invitations",
        headers=auth_headers(admin),
        json={"business_name": "Cafe Dos", "email": "dup@example.com"},
    )

    assert first.status_code == 202
    assert second.status_code == 409
    assert second.json()["detail"] == "There is already a pending invitation for this email"
    assert db.scalars(select(Business).where(Business.slug == "cafe-dos")).all() == []


def test_existing_active_user_email_is_rejected_for_invitation(
    client, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = make_user(db, "admin-existing@example.com", admin=True)
    make_user(db, "existing-owner@example.com", password="owner-pass-123")
    monkeypatch.setattr("app.api.routes.outbound_email_enabled", lambda: True)
    monkeypatch.setattr("app.api.routes.send_invitation_email", lambda _email, _token: None)

    response = client.post(
        "/admin/invitations",
        headers=auth_headers(admin),
        json={"business_name": "Conflict Biz", "email": "existing-owner@example.com"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "User email already exists with an active account"
    assert db.scalars(select(Business).where(Business.slug == "conflict-biz")).all() == []
