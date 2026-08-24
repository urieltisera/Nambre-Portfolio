import Link from "next/link";
import type {Metadata} from "next";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";
import {LegalDocumentView} from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description: "Tratamiento de datos vigente para el piloto de Nambre en Argentina.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <AppearanceProvider>
      <main className="legal-page">
        <div className="legal-page__shell">
          <NambreBrand className="legal-page__brand" />
          <div className="legal-page__header">
            <span className="legal-page__eyebrow">Documento legal público</span>
            <h1>Política de Privacidad</h1>
            <p>
              Este texto describe el tratamiento operativo actual de datos en Nambre durante el
              piloto y queda preparado para revisión legal posterior.
            </p>
          </div>
          <article className="legal-page__content">
            <LegalDocumentView activeDocument="privacy" />
          </article>
          <div className="legal-page__actions">
            <Link className="ui-button ui-button--primary" href="/">
              Volver a Nambre
            </Link>
            <Link className="ui-button ui-button--ghost" href="/terms">
              Ver términos
            </Link>
          </div>
        </div>
      </main>
    </AppearanceProvider>
  );
}
