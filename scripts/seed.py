from sqlalchemy import select

from app.auth.security import hash_password
from app.db import SessionLocal
from app.models import Business, BusinessStatus, Membership, MembershipRole, User


def main() -> None:
    db = SessionLocal()
    try:
        admin = db.scalar(select(User).where(User.email == "admin@example.com"))
        if admin is None:
            admin = User(
                email="admin@example.com",
                password_hash=hash_password("admin12345"),
                is_platform_admin=True,
            )
            db.add(admin)
        owner = db.scalar(select(User).where(User.email == "owner@example.com"))
        if owner is None:
            owner = User(
                email="owner@example.com",
                password_hash=hash_password("owner12345"),
            )
            db.add(owner)
        business = db.scalar(select(Business).where(Business.slug == "bar-central"))
        if business is None:
            business = Business(name="Bar Central", slug="bar-central", status=BusinessStatus.active)
            db.add(business)
            db.flush()
        if not db.scalar(select(Membership).where(Membership.user_id == owner.id, Membership.business_id == business.id)):
            db.add(Membership(user_id=owner.id, business_id=business.id, role=MembershipRole.owner))
        db.commit()
        print("Seed listo: admin@example.com/admin12345 y owner@example.com/owner12345")
    finally:
        db.close()


if __name__ == "__main__":
    main()

