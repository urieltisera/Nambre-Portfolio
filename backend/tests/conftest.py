import os
import tempfile
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, object_session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["SECRET_KEY"] = "test-secret-key-change-me-32-bytes-minimum"
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["STORAGE_PATH"] = tempfile.mkdtemp(prefix="menuflow-tests-")
os.environ["PUBLIC_BASE_URL"] = "https://menu.example.test"
os.environ["APP_TIMEZONE"] = "America/Argentina/Buenos_Aires"

from app.auth.security import create_access_token, create_user_session, hash_password  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.legal import CURRENT_LEGAL_VERSIONS  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import (  # noqa: E402
    AcceptanceMethod,
    Business,
    BusinessStatus,
    LegalAcceptance,
    Membership,
    MembershipRole,
    User,
)


@pytest.fixture()
def db() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db: Session) -> TestClient:
    app = create_app()

    def override_db() -> Generator[Session, None, None]:
        yield db

    app.dependency_overrides[get_db] = override_db
    return TestClient(app, follow_redirects=False)


def make_user(
    db: Session, email: str, password: str = "secret123", admin: bool = False, active: bool = True
) -> User:
    user = User(
        email=email.lower(),
        password_hash=hash_password(password),
        is_platform_admin=admin,
        is_active=active,
    )
    db.add(user)
    db.commit()
    return user


def make_business(
    db: Session, name: str, slug: str, status: BusinessStatus = BusinessStatus.active
) -> Business:
    business = Business(name=name, slug=slug, status=status)
    db.add(business)
    db.commit()
    return business


def add_membership(db: Session, user: User, business: Business, role: MembershipRole) -> Membership:
    membership = Membership(user_id=user.id, business_id=business.id, role=role)
    db.add(membership)
    db.commit()
    return membership


def _session_auth_headers(user: User, *, seed_legal: bool) -> dict[str, str]:
    session = object_session(user)
    if session is not None:
        if seed_legal:
            for document_type, document_version in CURRENT_LEGAL_VERSIONS.items():
                exists = (
                    session.query(LegalAcceptance)
                    .filter_by(
                        user_id=user.id,
                        business_id=None,
                        document_type=document_type,
                        document_version=document_version,
                    )
                    .first()
                )
                if exists is None:
                    session.add(
                        LegalAcceptance(
                            user_id=user.id,
                            business_id=None,
                            document_type=document_type,
                            document_version=document_version,
                            acceptance_method=AcceptanceMethod.seeded,
                        )
                    )
        user_session = create_user_session(session, user)
        session.commit()
        return {"Authorization": f"Bearer {create_access_token(user, user_session)}"}
    raise RuntimeError("User must be attached to a session before creating auth headers")


def auth_headers(user: User) -> dict[str, str]:
    return _session_auth_headers(user, seed_legal=True)


def unaccepted_auth_headers(user: User) -> dict[str, str]:
    return _session_auth_headers(user, seed_legal=False)


def legacy_auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}
