import logging
import smtplib
from email.message import EmailMessage
from html import escape
from urllib.parse import urlencode

from app.config import get_settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    pass


def outbound_email_enabled() -> bool:
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


def password_reset_delivery_enabled() -> bool:
    return outbound_email_enabled()


def build_password_reset_url(token: str) -> str:
    base_url = get_settings().frontend_base_url.rstrip("/")
    return f"{base_url}/reset-password?{urlencode({'token': token})}"


def build_invitation_url(token: str) -> str:
    base_url = get_settings().frontend_base_url.rstrip("/")
    return f"{base_url}/activate-account?{urlencode({'token': token})}"


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
    return build_branded_email_html(
        title="Restablecé tu contraseña",
        intro="Recibimos una solicitud para restablecer tu contraseña de Nambre.",
        cta_label="Restablecer contraseña",
        cta_url=reset_url,
        primary_note=f"Este enlace vence en {expiry_minutes} minutos y solo puede usarse una vez.",
        secondary_note="Si no solicitaste este cambio, podés ignorar este mensaje.",
        fallback_label="Si el botón no funciona, copiá y pegá este enlace en tu navegador:",
    )


def build_invitation_text_content(invitation_url: str, expiry_hours: int) -> str:
    return "\n".join(
        [
            "Hola,",
            "",
            "Tu acceso a Nambre está listo.",
            "El equipo de Nambre habilitó tu acceso y ahora te toca definir tu propia contraseña.",
            f"Usá este enlace para crearla: {invitation_url}",
            f"El enlace vence en {expiry_hours} horas y solo puede usarse una vez.",
            "",
            (
                "También necesitaremos que aceptes los documentos legales vigentes durante la "
                "activación."
            ),
            "Si no esperabas este mensaje, podés ignorarlo.",
            "",
            "Equipo Nambre",
        ]
    )


def build_invitation_html_content(invitation_url: str, expiry_hours: int) -> str:
    return build_branded_email_html(
        title="Tu acceso a Nambre está listo",
        intro=(
            "El equipo de Nambre habilitó tu acceso. Ahora te toca definir tu propia "
            "contraseña para activar la cuenta."
        ),
        cta_label="Crear contraseña",
        cta_url=invitation_url,
        primary_note=f"Este enlace vence en {expiry_hours} horas y solo puede usarse una vez.",
        secondary_note=(
            "Durante la activación también te vamos a pedir que aceptes los documentos "
            "legales vigentes de Nambre."
        ),
        fallback_label="Si el botón no funciona, copiá y pegá este enlace en tu navegador:",
    )


def build_branded_email_html(
    *,
    title: str,
    intro: str,
    cta_label: str,
    cta_url: str,
    primary_note: str,
    secondary_note: str,
    fallback_label: str,
) -> str:
    escaped_url = escape(cta_url, quote=True)
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
                      <h1 style="{title_style}">{escape(title)}</h1>
                      <p style="{paragraph_style}">
                        {escape(intro)}
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
                              {escape(cta_label)}
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="{secondary_text_style}">
                        {escape(primary_note)}
                      </p>
                      <p style="{secondary_text_last_style}">
                        {escape(secondary_note)}
                      </p>
                      <p style="{fallback_label_style}">
                        {escape(fallback_label)}
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
    if not outbound_email_enabled():
        raise EmailDeliveryError("SMTP password reset delivery is not configured")
    reset_url = build_password_reset_url(token)
    send_transactional_email(
        recipient_email=recipient_email,
        subject="Restablecé tu contraseña de Nambre",
        plain_text=build_password_reset_text_content(
            reset_url,
            settings.password_reset_token_minutes,
        ),
        html=build_password_reset_html_content(reset_url, settings.password_reset_token_minutes),
        failure_log="Password reset email delivery failed for %s",
        failure_message="Password reset email delivery failed",
    )


def send_invitation_email(recipient_email: str, token: str) -> None:
    settings = get_settings()
    if not outbound_email_enabled():
        raise EmailDeliveryError("SMTP invitation delivery is not configured")
    invitation_url = build_invitation_url(token)
    send_transactional_email(
        recipient_email=recipient_email,
        subject="Tu acceso a Nambre está listo",
        plain_text=build_invitation_text_content(invitation_url, settings.invitation_token_hours),
        html=build_invitation_html_content(invitation_url, settings.invitation_token_hours),
        failure_log="Invitation email delivery failed for %s",
        failure_message="Invitation email delivery failed",
    )


def send_transactional_email(
    *,
    recipient_email: str,
    subject: str,
    plain_text: str,
    html: str,
    failure_log: str,
    failure_message: str,
) -> None:
    settings = get_settings()
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
        raise EmailDeliveryError(failure_message)
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = (
        f"{settings.smtp_from_name} <{smtp_from_email}>"
        if settings.smtp_from_name
        else smtp_from_email
    )
    message["To"] = recipient_email
    message.set_content(plain_text)
    message.add_alternative(html, subtype="html")

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
        logger.exception(failure_log, recipient_email)
        raise EmailDeliveryError(failure_message) from exc
