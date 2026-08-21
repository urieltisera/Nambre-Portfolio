from collections.abc import Iterable

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.legal import CURRENT_LEGAL_VERSIONS, MANDATORY_LEGAL_DOCUMENTS
from app.models import AcceptanceMethod, LegalAcceptance, LegalDocumentType, User


def latest_legal_acceptances(
    db: Session, user_id: str, business_id: str | None = None
) -> dict[LegalDocumentType, LegalAcceptance]:
    filters = [LegalAcceptance.user_id == user_id]
    if business_id is None:
        filters.append(LegalAcceptance.business_id.is_(None))
    else:
        filters.append(
            or_(LegalAcceptance.business_id == business_id, LegalAcceptance.business_id.is_(None))
        )
    acceptances = db.scalars(
        select(LegalAcceptance).where(*filters).order_by(LegalAcceptance.accepted_at.desc())
    ).all()
    latest: dict[LegalDocumentType, LegalAcceptance] = {}
    for acceptance in acceptances:
        latest.setdefault(acceptance.document_type, acceptance)
    return latest


def pending_legal_documents(
    db: Session, user: User, business_id: str | None = None
) -> list[LegalDocumentType]:
    latest = latest_legal_acceptances(db, user.id, business_id)
    pending: list[LegalDocumentType] = []
    for document_type in MANDATORY_LEGAL_DOCUMENTS:
        accepted = latest.get(document_type)
        if accepted is None or accepted.document_version != CURRENT_LEGAL_VERSIONS[document_type]:
            pending.append(document_type)
    return pending


def accept_legal_documents(
    db: Session,
    *,
    user: User,
    acceptance_method: AcceptanceMethod,
    business_id: str | None = None,
    document_types: Iterable[LegalDocumentType] | None = None,
) -> list[LegalAcceptance]:
    requested = list(document_types or MANDATORY_LEGAL_DOCUMENTS)
    created: list[LegalAcceptance] = []
    latest = latest_legal_acceptances(db, user.id, business_id)
    for document_type in requested:
        current_version = CURRENT_LEGAL_VERSIONS[document_type]
        existing = latest.get(document_type)
        if existing is not None and existing.document_version == current_version:
            continue
        acceptance = LegalAcceptance(
            user_id=user.id,
            business_id=business_id,
            document_type=document_type,
            document_version=current_version,
            acceptance_method=acceptance_method,
        )
        db.add(acceptance)
        created.append(acceptance)
    db.flush()
    return created
