from collections import Counter
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
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
    now = _now_utc()
    today_start, tomorrow_start = _local_day_bounds(now)
    scans_today = _count_between(db, business_id, today_start, tomorrow_start)
    scans_7d = _count_since(db, business_id, now - timedelta(days=7))
    scans_30d = _count_since(db, business_id, now - timedelta(days=30))
    busiest = _busiest_local_hour(db, business_id, now - timedelta(days=30))
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
    now = _now_utc()
    local_now = _to_local(now)
    start_local = datetime.combine(
        local_now.date() - timedelta(days=days - 1), time.min, tzinfo=_app_timezone()
    )
    start = start_local.astimezone(UTC)
    counts: dict[str, int] = {}
    for event in db.scalars(
        select(ScanEvent).where(ScanEvent.business_id == business_id, ScanEvent.scanned_at >= start)
    ):
        local_day = _to_local(event.scanned_at).date().isoformat()
        counts[local_day] = counts.get(local_day, 0) + 1
    return [
        {
            "date": (start_local + timedelta(days=offset)).date().isoformat(),
            "scans": counts.get((start_local + timedelta(days=offset)).date().isoformat(), 0),
        }
        for offset in range(days)
    ]


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _app_timezone() -> ZoneInfo:
    return ZoneInfo(get_settings().app_timezone)


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _to_local(value: datetime) -> datetime:
    return _to_utc(value).astimezone(_app_timezone())


def _local_day_bounds(reference: datetime) -> tuple[datetime, datetime]:
    local_reference = _to_local(reference)
    start_local = datetime.combine(local_reference.date(), time.min, tzinfo=_app_timezone())
    next_start_local = start_local + timedelta(days=1)
    return start_local.astimezone(UTC), next_start_local.astimezone(UTC)


def _busiest_local_hour(db: Session, business_id: str, start: datetime) -> int | None:
    counts = Counter(
        _to_local(event.scanned_at).hour
        for event in db.scalars(
            select(ScanEvent).where(
                ScanEvent.business_id == business_id,
                ScanEvent.scanned_at >= start,
            )
        )
    )
    if not counts:
        return None
    return min((-count, hour) for hour, count in counts.items())[1]


def _count_between(db: Session, business_id: str, start: datetime, end: datetime) -> int:
    return (
        db.scalar(
            select(func.count(ScanEvent.id)).where(
                ScanEvent.business_id == business_id,
                ScanEvent.scanned_at >= start,
                ScanEvent.scanned_at < end,
            )
        )
        or 0
    )


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
