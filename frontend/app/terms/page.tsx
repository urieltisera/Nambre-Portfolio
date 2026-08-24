import Link from "next/link";
import type {Metadata} from "next";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";
import {LegalDocumentView} from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description: "Condiciones operativas vigentes del piloto de Nambre en Argentina.",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
  return (
    <AppearanceProvider>
      <main className="legal-page">
        <div className="legal-page__shell">
          <NambreBrand className="legal-page__brand" />
          <div className="legal-page__header">
            <span className="legal-page__eyebrow">Documento legal público</span>
            <h1>Términos y Condiciones</h1>
            <p>
              Texto operativo del piloto de Nambre. Está preparado para uso real y futura revisión
              profesional, sin presentarse como asesoramiento jurídico definitivo.
            </p>
          </div>
          <article className="legal-page__content">
            <LegalDocumentView activeDocument="terms" />
          </article>
          <div className="legal-page__actions">
            <Link className="ui-button ui-button--primary" href="/">
              Volver a Nambre
            </Link>
            <Link className="ui-button ui-button--ghost" href="/privacy">
              Ver privacidad
            </Link>
          </div>
        </div>
      </main>
    </AppearanceProvider>
  );
}
