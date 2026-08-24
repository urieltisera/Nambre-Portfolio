from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import bcrypt
import jwt
from fastapi import Cookie, Depends, Header, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import User, UserSession

SESSION_COOKIE_NAME = "nambre_session"
SESSION_COOKIE_PATH = "/"
SESSION_COOKIE_SAMESITE: Literal["lax"] = "lax"


@dataclass(frozen=True)
class AuthContext:
    user: User
    session: UserSession | None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_user_session(db: Session, user: User) -> UserSession:
    issued_at = datetime.now(UTC)
    session = UserSession(
        user_id=user.id,
        issued_at=issued_at,
        expires_at=issued_at + timedelta(minutes=get_settings().access_token_minutes),
    )
    db.add(session)
    db.flush()
    return session


def create_access_token(user: User, session: UserSession | None = None) -> str:
    settings = get_settings()
    expires = (
        session.expires_at
        if session is not None
        else datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes)
    )
    payload: dict[str, Any] = {"sub": user.id, "email": user.email, "exp": expires}
    if session is not None:
        payload["sid"] = session.id
        payload["iat"] = int(session.issued_at.timestamp())
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def session_cookie_secure(settings: Settings | None = None) -> bool:
    resolved_settings = settings or get_settings()
    return resolved_settings.environment not in {"local", "test"}


def set_session_cookie(
    response: Response, token: str, settings: Settings | None = None
) -> None:
    resolved_settings = settings or get_settings()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=resolved_settings.access_token_minutes * 60,
        path=SESSION_COOKIE_PATH,
        samesite=SESSION_COOKIE_SAMESITE,
        secure=session_cookie_secure(resolved_settings),
    )


def clear_session_cookie(response: Response, settings: Settings | None = None) -> None:
    resolved_settings = settings or get_settings()
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path=SESSION_COOKIE_PATH,
        httponly=True,
        samesite=SESSION_COOKIE_SAMESITE,
        secure=session_cookie_secure(resolved_settings),
    )


def _decode_auth_token(token: str, db: Session) -> AuthContext:
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc
    user_id = payload.get("sub")
    user = db.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive or missing user"
        )
    session_id = payload.get("sid")
    if session_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    session = db.get(UserSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    now = datetime.now(UTC)
    expires_at = (
        session.expires_at.replace(tzinfo=UTC)
        if session.expires_at.tzinfo is None
        else session.expires_at
    )
    if session.revoked_at is not None or expires_at <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    return AuthContext(user=user, session=session)


def get_current_auth(
    authorization: str | None = Header(default=None),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> AuthContext:
    token = (
        authorization.removeprefix("Bearer ").strip()
        if authorization and authorization.startswith("Bearer ")
        else session_cookie
    )
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return _decode_auth_token(token, db)


def get_current_user(auth: AuthContext = Depends(get_current_auth)) -> User:
    return auth.user
