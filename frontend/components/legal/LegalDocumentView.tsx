"use client";

import React from "react";
import Link from "next/link";
import {LEGAL_DOCUMENT_COPY, LEGAL_DOCUMENT_LABELS, LEGAL_DOCUMENT_ORDER, LEGAL_LAST_UPDATED, LEGAL_VERSION} from "@/lib/legal-copy";
import type {LegalDocumentType} from "@/lib/api";

type LegalDocumentViewProps = {
  activeDocument: LegalDocumentType;
  compact?: boolean;
  showPublicLink?: boolean;
};

export function LegalDocumentView({
  activeDocument,
  compact = false,
  showPublicLink = false,
}: LegalDocumentViewProps) {
  const document = LEGAL_DOCUMENT_COPY[activeDocument];

  return (
    <div className={compact ? "legal-document legal-document--compact" : "legal-document"}>
      <div className="legal-document__meta">
        <span className="legal-document__badge">Versión legal {LEGAL_VERSION}</span>
        <span>Actualizado el {LEGAL_LAST_UPDATED}</span>
      </div>
      <div className="legal-document__intro">
        <p className="legal-document__summary">{document.summary}</p>
        <p>{document.lead}</p>
        {document.note ? <p className="legal-document__note">{document.note}</p> : null}
      </div>
      <nav aria-label="Documentos legales" className="legal-document__nav">
        {LEGAL_DOCUMENT_ORDER.map((documentType) => (
          <Link
            aria-current={documentType === activeDocument ? "page" : undefined}
            className={
              documentType === activeDocument
                ? "legal-document__nav-link is-active"
                : "legal-document__nav-link"
            }
            href={LEGAL_DOCUMENT_COPY[documentType].path}
            key={documentType}
          >
            {LEGAL_DOCUMENT_LABELS[documentType]}
          </Link>
        ))}
      </nav>
      <div className="legal-document__sections">
        {document.sections.map((section) => (
          <section className="legal-document__section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.bullets ? (
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
      {showPublicLink ? (
        <div className="legal-document__footer">
          <Link className="ui-button ui-button--ghost ui-button--sm" href={document.path}>
            Abrir página pública
          </Link>
        </div>
      ) : null}
    </div>
  );
}
