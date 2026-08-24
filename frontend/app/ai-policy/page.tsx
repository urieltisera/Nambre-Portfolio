import Link from "next/link";
import type {Metadata} from "next";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";
import {LegalDocumentView} from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Política de IA",
  description: "Alcance actual del uso de inteligencia artificial en Nambre.",
  alternates: {
    canonical: "/ai-policy",
  },
};

export default function AiPolicyPage() {
  return (
    <AppearanceProvider>
      <main className="legal-page">
        <div className="legal-page__shell">
          <NambreBrand className="legal-page__brand" />
          <div className="legal-page__header">
            <span className="legal-page__eyebrow">Documento legal público</span>
            <h1>Política de IA</h1>
            <p>
              Estado actual del producto respecto a inteligencia artificial y límites explícitos del
              piloto.
            </p>
          </div>
          <article className="legal-page__content">
            <LegalDocumentView activeDocument="ai_policy" />
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
