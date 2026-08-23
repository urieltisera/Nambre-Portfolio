import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import (
    create_access_token,
    create_user_session,
    hash_password,
    verify_password,
)
from app.config import get_settings
from app.models import PasswordResetToken, User, UserSession
from app.services.user_admin_service import validate_password


class InvalidCurrentPasswordError(ValueError):
    pass


class PasswordResetTokenError(ValueError):
    pass


def revoke_user_sessions(
    db: Session, user_id: str, reason: str, *, exclude_session_id: str | None = None
) -> int:
    revoked = 0
    now = datetime.now(UTC)
    sessions = db.scalars(select(UserSession).where(UserSession.user_id == user_id)).all()
    for session in sessions:
        if session.revoked_at is not None:
            continue
        if exclude_session_id is not None and session.id == exclude_session_id:
            continue
        session.revoked_at = now
        session.revoke_reason = reason
        revoked += 1
    return revoked


def hash_password_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_password_reset_token(db: Session, user: User) -> str:
    now = datetime.now(UTC)
    for existing in user.password_reset_tokens:
        if existing.consumed_at is None:
            existing.consumed_at = now
    token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_password_reset_token(token),
            expires_at=now + timedelta(minutes=get_settings().password_reset_token_minutes),
        )
    )
    db.flush()
    return token


def change_password(
    db: Session,
    user: User,
    *,
    current_password: str,
    new_password: str,
) -> str:
    if not verify_password(current_password, user.password_hash):
        raise InvalidCurrentPasswordError("Current password is incorrect.")
    validated_password = validate_password(new_password)
    user.password_hash = hash_password(validated_password)
    revoke_user_sessions(db, user.id, "password_changed")
    new_session = create_user_session(db, user)
    db.flush()
    return create_access_token(user, new_session)


def reset_password(db: Session, *, token: str, new_password: str) -> str:
    now = datetime.now(UTC)
    hashed_token = hash_password_reset_token(token)
    reset_token = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hashed_token)
    )
    if reset_token is None:
        raise PasswordResetTokenError("Invalid or expired password reset token.")
    expires_at = (
        reset_token.expires_at.replace(tzinfo=UTC)
        if reset_token.expires_at.tzinfo is None
        else reset_token.expires_at
    )
    if reset_token.consumed_at is not None or expires_at <= now:
        raise PasswordResetTokenError("Invalid or expired password reset token.")
    validated_password = validate_password(new_password)
    user = db.get(User, reset_token.user_id)
    if user is None or not user.is_active:
        reset_token.consumed_at = now
        raise PasswordResetTokenError("Invalid or expired password reset token.")
    user.password_hash = hash_password(validated_password)
    reset_token.consumed_at = now
    revoke_user_sessions(db, user.id, "password_reset")
    return user.id
