import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditEvent


def record_audit_event(
    db: Session,
    *,
    event_type: str,
    actor_user_id: str | None = None,
    business_id: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        actor_user_id=actor_user_id,
        business_id=business_id,
        event_type=event_type,
        target_type=target_type,
        target_id=target_id,
        details_json=json.dumps(details, sort_keys=True) if details else None,
    )
    db.add(event)
    db.flush()
    return event
