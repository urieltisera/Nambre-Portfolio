import json
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEvent, PasswordResetToken
from app.services import auth_service, email_service
from app.services.email_service import EmailDeliveryError
from tests.conftest import make_user


def test_password_reset_request_triggers_email_delivery_when_configured(
    client, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_user(db, "deliver@example.com", password="deliver-pass-123")
    deliveries: list[tuple[str, str]] = []

    monkeypatch.setattr(auth_service.secrets, "token_urlsafe", lambda _size: "deliver-known-token")
    monkeypatch.setattr("app.api.routes.password_reset_delivery_enabled", lambda: True)
    monkeypatch.setattr(
        "app.api.routes.send_password_reset_email",
        lambda email, token: deliveries.append((email, token)),
    )

    response = client.post("/auth/password-reset/request", json={"email": "deliver@example.com"})

    assert response.status_code == 202
    assert deliveries == [("deliver@example.com", "deliver-known-token")]

    token = db.scalar(select(PasswordResetToken))
    assert token is not None
    assert token.token_hash == auth_service.hash_password_reset_token("deliver-known-token")

    event = db.scalar(
        select(AuditEvent)
        .where(AuditEvent.event_type == "auth.password_reset_requested")
        .order_by(AuditEvent.occurred_at.desc())
    )
    assert event is not None
    assert json.loads(event.details_json or "{}")["delivery"] == "sent"


def test_password_reset_request_swallows_email_delivery_failures(
    client, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_user(db, "failure@example.com", password="deliver-pass-123")

    monkeypatch.setattr(auth_service.secrets, "token_urlsafe", lambda _size: "failing-reset-token")
    monkeypatch.setattr("app.api.routes.password_reset_delivery_enabled", lambda: True)

    def fail_send(_email: str, _token: str) -> None:
        raise EmailDeliveryError("Password reset email delivery failed")

    monkeypatch.setattr("app.api.routes.send_password_reset_email", fail_send)

    response = client.post("/auth/password-reset/request", json={"email": "failure@example.com"})

    assert response.status_code == 202
    assert response.json()["message"] == (
        "Si existe una cuenta asociada, recibiras instrucciones para recuperar el acceso."
    )

    event = db.scalar(
        select(AuditEvent)
        .where(AuditEvent.event_type == "auth.password_reset_requested")
        .order_by(AuditEvent.occurred_at.desc())
    )
    assert event is not None
    details = event.details_json or ""
    assert "failed" in details
    assert "failing-reset-token" not in details
    assert "SMTP" not in details


def test_password_reset_url_uses_frontend_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        email_service,
        "get_settings",
        lambda: SimpleNamespace(frontend_base_url="https://app.nambre.test"),
    )

    url = email_service.build_password_reset_url("reset-token-123")

    assert url == "https://app.nambre.test/reset-password?token=reset-token-123"
