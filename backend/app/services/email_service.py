import logging
import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode

from app.config import get_settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    pass


def password_reset_delivery_enabled() -> bool:
    settings = get_settings()
    return all(
        [
            settings.smtp_host,
            settings.smtp_username,
            settings.smtp_password,
            settings.smtp_from_email,
            settings.frontend_base_url,
        ]
    )


def build_password_reset_url(token: str) -> str:
    base_url = get_settings().frontend_base_url.rstrip("/")
    return f"{base_url}/reset-password?{urlencode({'token': token})}"


def send_password_reset_email(recipient_email: str, token: str) -> None:
    settings = get_settings()
    if not password_reset_delivery_enabled():
        raise EmailDeliveryError("SMTP password reset delivery is not configured")
    smtp_host = settings.smtp_host
    smtp_username = settings.smtp_username
    smtp_password = settings.smtp_password
    smtp_from_email = settings.smtp_from_email
    if (
        smtp_host is None
        or smtp_username is None
        or smtp_password is None
        or smtp_from_email is None
    ):
        raise EmailDeliveryError("SMTP password reset delivery is not configured")

    reset_url = build_password_reset_url(token)
    subject = "Restablecé tu contraseña de Nambre"
    expiry_minutes = settings.password_reset_token_minutes
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = (
        f"{settings.smtp_from_name} <{smtp_from_email}>"
        if settings.smtp_from_name
        else smtp_from_email
    )
    message["To"] = recipient_email
    message.set_content(
        "\n".join(
            [
                "Hola,",
                "",
                "Recibimos una solicitud para restablecer tu contraseña de Nambre.",
                f"Usá este enlace para continuar: {reset_url}",
                f"El enlace vence en {expiry_minutes} minutos y solo puede usarse una vez.",
                "",
                "Si no solicitaste este cambio, podés ignorar este mensaje.",
                "",
                "Equipo Nambre",
            ]
        )
    )

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(
                smtp_host,
                settings.smtp_port,
                timeout=settings.smtp_timeout_seconds,
            ) as smtp:
                smtp.login(smtp_username, smtp_password)
                smtp.send_message(message)
            return

        with smtplib.SMTP(
            smtp_host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
        ) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            smtp.login(smtp_username, smtp_password)
            smtp.send_message(message)
    except Exception as exc:  # pragma: no cover - exercised through caller behavior
        logger.exception("Password reset email delivery failed for %s", recipient_email)
        raise EmailDeliveryError("Password reset email delivery failed") from exc
