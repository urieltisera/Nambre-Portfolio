import json
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEvent, PasswordResetToken
from app.services import auth_service, email_service
from app.services.email_service import EmailDeliveryError
from tests.conftest import make_user


class _FakeSMTP:
    sent_messages: list[object] = []
    started_tls = False
    logged_in_with: tuple[str, str] | None = None

    def __init__(self, _host: str, _port: int, timeout: int) -> None:
        self.timeout = timeout

    def __enter__(self) -> "_FakeSMTP":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def starttls(self) -> None:
        type(self).started_tls = True

    def login(self, username: str, password: str) -> None:
        type(self).logged_in_with = (username, password)

    def send_message(self, message: object) -> None:
        type(self).sent_messages.append(message)


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


def test_password_reset_email_includes_html_and_plain_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _FakeSMTP.sent_messages = []
    _FakeSMTP.started_tls = False
    _FakeSMTP.logged_in_with = None

    monkeypatch.setattr(
        email_service,
        "get_settings",
        lambda: SimpleNamespace(
            frontend_base_url="https://app.nambre.test",
            password_reset_token_minutes=30,
            smtp_host="smtp.nambre.test",
            smtp_port=587,
            smtp_username="mailer",
            smtp_password="secret",
            smtp_from_email="no-reply@nambre.test",
            smtp_from_name="Nambre",
            smtp_use_tls=True,
            smtp_use_ssl=False,
            smtp_timeout_seconds=10,
        ),
    )
    monkeypatch.setattr(email_service.smtplib, "SMTP", _FakeSMTP)

    email_service.send_password_reset_email("person@example.com", "reset-token-123")

    assert _FakeSMTP.started_tls is True
    assert _FakeSMTP.logged_in_with == ("mailer", "secret")
    assert len(_FakeSMTP.sent_messages) == 1

    message = _FakeSMTP.sent_messages[0]
    plain_part = message.get_body(preferencelist=("plain",))
    html_part = message.get_body(preferencelist=("html",))
    reset_url = "https://app.nambre.test/reset-password?token=reset-token-123"

    assert message["Subject"] == "Restablecé tu contraseña de Nambre"
    assert message["To"] == "person@example.com"
    assert message.is_multipart() is True
    assert plain_part is not None
    assert html_part is not None

    plain_content = plain_part.get_content()
    html_content = html_part.get_content()

    assert "Recibimos una solicitud para restablecer tu contraseña de Nambre." in plain_content
    assert "Recibimos una solicitud para restablecer tu contraseña de Nambre." in html_content
    assert "Restablecer contraseña" in html_content
    assert f'href="{reset_url}"' in html_content
    assert reset_url in plain_content
    assert reset_url in html_content
    assert "Este enlace vence en 30 minutos y solo puede usarse una vez." in html_content
    assert "El enlace vence en 30 minutos y solo puede usarse una vez." in plain_content
    assert "Si no solicitaste este cambio, podés ignorar este mensaje." in plain_content
    assert "Si no solicitaste este cambio, podés ignorar este mensaje." in html_content
    assert ">reset-token-123<" not in html_content
    assert "\nreset-token-123\n" not in plain_content
