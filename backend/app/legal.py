from app.models import LegalDocumentType

CURRENT_LEGAL_VERSIONS: dict[LegalDocumentType, str] = {
    LegalDocumentType.terms: "2026-08-21",
    LegalDocumentType.privacy: "2026-08-21",
    LegalDocumentType.acceptable_use: "2026-08-21",
    LegalDocumentType.cookies_analytics: "2026-08-21",
    LegalDocumentType.ai_policy: "2026-08-21",
}

MANDATORY_LEGAL_DOCUMENTS: tuple[LegalDocumentType, ...] = tuple(CURRENT_LEGAL_VERSIONS.keys())
