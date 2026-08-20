import argparse
import getpass
import os
import sys
from pathlib import Path


def _ensure_backend_on_path() -> None:
    try:
        import app  # noqa: F401
    except ModuleNotFoundError:
        backend_dir = Path(__file__).resolve().parent.parent / "backend"
        if backend_dir.exists():
            sys.path.insert(0, str(backend_dir))


_ensure_backend_on_path()

from app.db import SessionLocal
from app.services.user_admin_service import (  # noqa: E402
    AdminCreationError,
    CreatePlatformAdminResult,
    create_platform_admin,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a real MenuFlow platform admin without exposing passwords."
    )
    parser.add_argument("--email", help="Admin email. Falls back to ADMIN_EMAIL or interactive input.")
    parser.add_argument(
        "--password",
        help="Admin password. Prefer ADMIN_PASSWORD or interactive input to avoid shell history leaks.",
    )
    parser.add_argument(
        "--promote-existing",
        action="store_true",
        help="Explicitly promote an existing non-admin user and replace its password hash.",
    )
    return parser.parse_args()


def _read_email(args: argparse.Namespace) -> str:
    email = args.email or os.environ.get("ADMIN_EMAIL")
    if email:
        return email
    if sys.stdin.isatty():
        return input("Admin email: ").strip()
    raise SystemExit("Missing admin email. Pass --email, set ADMIN_EMAIL, or run interactively.")


def _read_password(args: argparse.Namespace) -> str:
    password = args.password or os.environ.get("ADMIN_PASSWORD")
    if password:
        return password
    if not sys.stdin.isatty():
        raise SystemExit(
            "Missing admin password. Pass --password, set ADMIN_PASSWORD, or run interactively."
        )
    first = getpass.getpass("Admin password: ")
    second = getpass.getpass("Confirm admin password: ")
    if first != second:
        raise SystemExit("Password confirmation did not match.")
    return first


def main() -> int:
    args = _parse_args()
    email = _read_email(args)
    password = _read_password(args)
    db = SessionLocal()
    try:
        result = create_platform_admin(
            db,
            email,
            password,
            promote_existing=args.promote_existing,
        )
    except AdminCreationError as exc:
        print(str(exc))
        return 1
    finally:
        db.close()

    if result == CreatePlatformAdminResult.created:
        print(f"Platform admin created for {email}.")
    elif result == CreatePlatformAdminResult.existing_admin:
        print(f"User {email} already exists as a platform admin.")
    else:
        print(f"Existing user {email} was promoted to platform admin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
