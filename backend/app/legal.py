from app.models import LegalDocumentType

CURRENT_LEGAL_VERSIONS: dict[LegalDocumentType, str] = {
    LegalDocumentType.terms: "2026-08-24",
    LegalDocumentType.privacy: "2026-08-24",
    LegalDocumentType.acceptable_use: "2026-08-24",
    LegalDocumentType.cookies_analytics: "2026-08-24",
    LegalDocumentType.ai_policy: "2026-08-24",
}

MANDATORY_LEGAL_DOCUMENTS: tuple[LegalDocumentType, ...] = tuple(CURRENT_LEGAL_VERSIONS.keys())
