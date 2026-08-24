import logging
import smtplib
from email.message import EmailMessage
from html import escape
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


def build_password_reset_text_content(reset_url: str, expiry_minutes: int) -> str:
    return "\n".join(
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


def build_password_reset_html_content(reset_url: str, expiry_minutes: int) -> str:
    escaped_url = escape(reset_url, quote=True)
    body_style = (
        "margin:0; padding:0; background-color:#f3f7f6; "
        "font-family:Arial, Helvetica, sans-serif; color:#12312f;"
    )
    wrapper_style = (
        "background-color:#f3f7f6; margin:0; padding:24px 0; width:100%;"
    )
    container_style = "max-width:600px; width:100%; margin:0 auto;"
    brand_style = (
        "padding:0 16px 24px 16px; text-align:center; font-size:28px; "
        "font-weight:700; letter-spacing:0.04em; color:#0f766e;"
    )
    card_style = (
        "background-color:#ffffff; border:1px solid #d7e3e1; "
        "border-radius:16px; width:100%;"
    )
    title_style = (
        "margin:0 0 16px 0; font-size:28px; line-height:36px; "
        "font-weight:700; color:#12312f;"
    )
    paragraph_style = "margin:0 0 24px 0; font-size:16px; line-height:24px; color:#355b57;"
    cta_style = (
        "display:inline-block; padding:14px 24px; font-size:16px; font-weight:700; "
        "line-height:20px; color:#ffffff; text-decoration:none;"
    )
    secondary_text_style = (
        "margin:0 0 12px 0; font-size:14px; line-height:22px; color:#4a6b68;"
    )
    secondary_text_last_style = (
        "margin:0 0 24px 0; font-size:14px; line-height:22px; color:#4a6b68;"
    )
    fallback_label_style = (
        "margin:0 0 8px 0; font-size:12px; line-height:18px; color:#6b8784;"
    )
    fallback_url_style = (
        "margin:0; font-size:12px; line-height:18px; color:#6b8784; "
        "word-break:break-all;"
    )
    footer_style = "padding:0 32px 32px 32px; font-size:13px; line-height:20px; color:#6b8784;"
    return f"""\
<!DOCTYPE html>
<html lang="es">
  <body style="{body_style}">
    <table
      role="presentation"
      cellpadding="0"
      cellspacing="0"
      border="0"
      width="100%"
      style="{wrapper_style}"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            cellpadding="0"
            cellspacing="0"
            border="0"
            width="100%"
            style="{container_style}"
          >
            <tr>
              <td style="{brand_style}">
                Nambre
              </td>
            </tr>
            <tr>
              <td style="padding:0 16px;">
                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  width="100%"
                  style="{card_style}"
                >
                  <tr>
                    <td style="padding:40px 32px 24px 32px;">
                      <h1 style="{title_style}">Restablecé tu contraseña</h1>
                      <p style="{paragraph_style}">
                        Recibimos una solicitud para restablecer tu contraseña de Nambre.
                      </p>
                      <table
                        role="presentation"
                        cellpadding="0"
                        cellspacing="0"
                        border="0"
                        style="margin:0 0 24px 0;"
                      >
                        <tr>
                          <td align="center" bgcolor="#0f766e" style="border-radius:999px;">
                            <a href="{escaped_url}" style="{cta_style}">
                              Restablecer contraseña
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="{secondary_text_style}">
                        Este enlace vence en {expiry_minutes} minutos y solo puede usarse una vez.
                      </p>
                      <p style="{secondary_text_last_style}">
                        Si no solicitaste este cambio, podés ignorar este mensaje.
                      </p>
                      <p style="{fallback_label_style}">
                        Si el botón no funciona, copiá y pegá este enlace en tu navegador:
                      </p>
                      <p style="{fallback_url_style}">
                        <a
                          href="{escaped_url}"
                          style="color:#0f766e; text-decoration:underline;"
                        >{escaped_url}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="{footer_style}">
                      Equipo Nambre
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


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
    message.set_content(build_password_reset_text_content(reset_url, expiry_minutes))
    message.add_alternative(
        build_password_reset_html_content(reset_url, expiry_minutes),
        subtype="html",
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
