# ruff: noqa: E402

import argparse
import getpass
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


def _ensure_backend_on_path() -> None:
    backend_dir = Path(__file__).resolve().parent.parent / "backend"
    if backend_dir.exists():
        os.chdir(backend_dir)
    try:
        import app  # noqa: F401
    except ModuleNotFoundError:
        if backend_dir.exists():
            sys.path.insert(0, str(backend_dir))


_ensure_backend_on_path()

from app.config import get_settings
from app.db import SessionLocal
from app.services.staging_business_service import (
    StagingBusinessProvisionError,
    create_staging_business,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create or explicitly reuse a local/staging owner business for Carta Nambre "
            "without SMTP or invitation emails."
        )
    )
    parser.add_argument(
        "--email",
        help="Owner email. Falls back to STAGING_OWNER_EMAIL or interactive input.",
    )
    parser.add_argument(
        "--password",
        help=(
            "Owner password. Prefer STAGING_OWNER_PASSWORD or interactive input "
            "to avoid shell history leaks."
        ),
    )
    parser.add_argument(
        "--business-name",
        help="Business name. Falls back to STAGING_BUSINESS_NAME or interactive input.",
    )
    parser.add_argument(
        "--reuse-existing",
        action="store_true",
        help=(
            "Explicitly reuse an existing user/business for the same email and slug, "
            "reset the password, and ensure owner membership plus premium digital menu setup."
        ),
    )
    return parser.parse_args()


def _read_required_value(
    *,
    explicit: str | None,
    env_name: str,
    prompt: str,
    secret: bool = False,
) -> str:
    value = explicit or os.environ.get(env_name)
    if value:
        return value.strip()
    if not sys.stdin.isatty():
        raise SystemExit(
            f"Missing value for {env_name}. Pass the flag, set {env_name}, or run interactively."
        )
    if secret:
        first = getpass.getpass(prompt)
        second = getpass.getpass(f"Confirm {prompt.lower()}")
        if first != second:
            raise SystemExit("Password confirmation did not match.")
        return first
    return input(prompt).strip()


def _mask_database_url(database_url: str) -> str:
    parts = urlsplit(database_url)
    if "@" not in parts.netloc:
        return database_url
    userinfo, hostinfo = parts.netloc.rsplit("@", 1)
    username = userinfo.split(":", 1)[0]
    masked_userinfo = f"{username}:***" if username else "***"
    return urlunsplit(
        (parts.scheme, f"{masked_userinfo}@{hostinfo}", parts.path, parts.query, parts.fragment)
    )


def _require_session_database_url() -> str:
    session_database_url = os.environ.get("DATABASE_URL")
    if not session_database_url:
        raise SystemExit(
            "DATABASE_URL must already be exported in this shell session before running the script."
        )
    settings_database_url = get_settings().database_url
    if session_database_url != settings_database_url:
        raise SystemExit(
            "DATABASE_URL from the shell session does not match the database URL loaded by the app."
        )
    if get_settings().environment not in {"local", "staging"}:
        raise SystemExit("This helper is restricted to local or staging environments.")
    return session_database_url


def main() -> int:
    args = _parse_args()
    database_url = _require_session_database_url()
    email = _read_required_value(
        explicit=args.email,
        env_name="STAGING_OWNER_EMAIL",
        prompt="Owner email: ",
    )
    password = _read_required_value(
        explicit=args.password,
        env_name="STAGING_OWNER_PASSWORD",
        prompt="Owner password: ",
        secret=True,
    )
    business_name = _read_required_value(
        explicit=args.business_name,
        env_name="STAGING_BUSINESS_NAME",
        prompt="Business name: ",
    )

    db = SessionLocal()
    try:
        result = create_staging_business(
            db,
            email=email,
            password=password,
            business_name=business_name,
            reuse_existing=args.reuse_existing,
        )
    except StagingBusinessProvisionError as exc:
        db.rollback()
        print(str(exc))
        return 1
    finally:
        db.close()

    print(f"Database: {_mask_database_url(database_url)}")
    print(f"Owner user: {result.user.email}")
    print(f"Business: {result.business.name} ({result.business.slug})")
    print(f"Plan: {result.business.plan_key.value}")
    print(f"Destination: {result.business.destination_type.value}")
    print(f"Membership role: {result.membership.role.value}")
    print(f"Digital menu: {result.digital_menu.id}")
    if result.dynamic_link is not None:
        print(f"Public code: {result.dynamic_link.public_code}")
    print(
        "Changes: "
        f"user={'created' if result.created_user else 'reused'}, "
        f"business={'created' if result.created_business else 'reused'}, "
        f"membership={'created' if result.created_membership else 'reused'}, "
        f"menu={'created' if result.created_digital_menu else 'reused'}"
    )
    if result.promoted_membership_to_owner:
        print("Existing membership was promoted to owner.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
