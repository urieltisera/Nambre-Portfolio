from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ScanEvent


def categorize_user_agent(user_agent: str | None) -> str | None:
    if not user_agent:
        return None
    lower = user_agent.lower()
    if "mobile" in lower or "android" in lower or "iphone" in lower:
        return "mobile"
    if "tablet" in lower or "ipad" in lower:
        return "tablet"
    return "desktop"


def record_scan(
    db: Session, dynamic_link_id: str, business_id: str, user_agent: str | None
) -> ScanEvent:
    event = ScanEvent(
        dynamic_link_id=dynamic_link_id,
        business_id=business_id,
        user_agent_category=categorize_user_agent(user_agent),
    )
    db.add(event)
    return event


def summary(db: Session, business_id: str) -> dict[str, int | None]:
    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    scans_today = _count_since(db, business_id, today_start)
    scans_7d = _count_since(db, business_id, now - timedelta(days=7))
    scans_30d = _count_since(db, business_id, now - timedelta(days=30))
    rows = db.execute(
        select(func.extract("hour", ScanEvent.scanned_at), func.count(ScanEvent.id))
        .where(
            ScanEvent.business_id == business_id, ScanEvent.scanned_at >= now - timedelta(days=30)
        )
        .group_by(func.extract("hour", ScanEvent.scanned_at))
        .order_by(func.count(ScanEvent.id).desc())
    ).first()
    busiest = int(rows[0]) if rows else None
    return {
        "scans_today": scans_today,
        "scans_7d": scans_7d,
        "scans_30d": scans_30d,
        "busiest_hour": busiest,
    }


def daily_series(db: Session, business_id: str, period: str) -> list[dict[str, str | int]]:
    days = {"1d": 1, "7d": 7, "30d": 30}.get(period)
    if days is None:
        days = 30
    now = datetime.now(UTC)
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    counts: dict[str, int] = {}
    for event in db.scalars(
        select(ScanEvent).where(ScanEvent.business_id == business_id, ScanEvent.scanned_at >= start)
    ):
        counts[event.scanned_at.date().isoformat()] = (
            counts.get(event.scanned_at.date().isoformat(), 0) + 1
        )
    return [
        {
            "date": (start + timedelta(days=offset)).date().isoformat(),
            "scans": counts.get((start + timedelta(days=offset)).date().isoformat(), 0),
        }
        for offset in range(days)
    ]


def _count_since(db: Session, business_id: str, start: datetime) -> int:
    return (
        db.scalar(
            select(func.count(ScanEvent.id)).where(
                ScanEvent.business_id == business_id,
                ScanEvent.scanned_at >= start,
            )
        )
        or 0
    )
