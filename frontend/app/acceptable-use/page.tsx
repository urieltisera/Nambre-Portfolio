import Link from "next/link";
import type {Metadata} from "next";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";
import {LegalDocumentView} from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Política de Uso Aceptable",
  description: "Reglas de uso permitido y prohibido del servicio Nambre.",
  alternates: {
    canonical: "/acceptable-use",
  },
};

export default function AcceptableUsePage() {
  return (
    <AppearanceProvider>
      <main className="legal-page">
        <div className="legal-page__shell">
          <NambreBrand className="legal-page__brand" />
          <div className="legal-page__header">
            <span className="legal-page__eyebrow">Documento legal público</span>
            <h1>Política de Uso Aceptable</h1>
            <p>Reglas de uso permitidas y medidas ante abuso, fraude o contenido riesgoso.</p>
          </div>
          <article className="legal-page__content">
            <LegalDocumentView activeDocument="acceptable_use" />
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
