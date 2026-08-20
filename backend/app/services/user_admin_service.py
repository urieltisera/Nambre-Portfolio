from enum import StrEnum

from pydantic import EmailStr, TypeAdapter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.models import User

_EMAIL_ADAPTER = TypeAdapter(EmailStr)


class CreatePlatformAdminResult(StrEnum):
    created = "created"
    existing_admin = "existing_admin"
    promoted_existing = "promoted_existing"


class AdminCreationError(ValueError):
    pass


def normalize_email(email: str) -> str:
    return str(_EMAIL_ADAPTER.validate_python(email)).lower()


def validate_password(password: str) -> str:
    if len(password) < 8:
        raise AdminCreationError("Password must be at least 8 characters long.")
    return password


def create_platform_admin(
    db: Session, email: str, password: str, *, promote_existing: bool = False
) -> CreatePlatformAdminResult:
    normalized_email = normalize_email(email)
    validated_password = validate_password(password)
    user = db.scalar(select(User).where(User.email == normalized_email))

    if user is None:
        db.add(
            User(
                email=normalized_email,
                password_hash=hash_password(validated_password),
                is_platform_admin=True,
            )
        )
        db.commit()
        return CreatePlatformAdminResult.created

    if user.is_platform_admin:
        return CreatePlatformAdminResult.existing_admin

    if not promote_existing:
        raise AdminCreationError(
            "User already exists and is not a platform admin. "
            "Re-run with explicit promotion enabled to promote this account."
        )

    user.password_hash = hash_password(validated_password)
    user.is_platform_admin = True
    db.commit()
    return CreatePlatformAdminResult.promoted_existing
