"use client";

import React from "react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";
import {LegalDocumentView} from "@/components/legal/LegalDocumentView";
import {LEGAL_DOCUMENT_COPY} from "@/lib/legal-copy";
import type {LegalDocumentType} from "@/lib/api";

export function LegalModal({
  documentType,
  onClose,
}: {
  documentType: LegalDocumentType;
  onClose: () => void;
}) {
  return (
    <div className="legal-modal" role="presentation">
      <button
        aria-label="Cerrar modal legal"
        className="legal-modal__backdrop"
        onClick={onClose}
        type="button"
      />
      <Card
        aria-labelledby="legal-modal-title"
        aria-modal="true"
        className="legal-modal__card"
        role="dialog"
      >
        <div className="legal-modal__header">
          <div>
            <p className="legal-modal__eyebrow">Paquete legal operativo del piloto</p>
            <h2 id="legal-modal-title">{LEGAL_DOCUMENT_COPY[documentType].title}</h2>
          </div>
          <Button onClick={onClose} size="sm" variant="ghost">
            Cerrar
          </Button>
        </div>
        <div className="legal-modal__body">
          <LegalDocumentView activeDocument={documentType} compact showPublicLink />
        </div>
      </Card>
    </div>
  );
}
