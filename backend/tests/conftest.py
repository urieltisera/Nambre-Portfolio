import os
import tempfile
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["SECRET_KEY"] = "test-secret-key-change-me-32-bytes-minimum"
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["STORAGE_PATH"] = tempfile.mkdtemp(prefix="menuflow-tests-")
os.environ["PUBLIC_BASE_URL"] = "https://menu.example.test"

from app.auth.security import create_access_token, hash_password  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Business, BusinessStatus, Membership, MembershipRole, User  # noqa: E402


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


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}
