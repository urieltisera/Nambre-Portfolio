import Link from "next/link";
import type { Metadata } from "next";
import { NambreBrand } from "@/components/brand/NambreBrand";
import { AppearanceProvider } from "@/components/ui/AppearanceProvider";
import { LEGAL_DOCUMENT_COPY } from "@/lib/legal-copy";

export const metadata: Metadata = {
  title: "Terminos y Condiciones",
  description: "Consulta los Terminos y Condiciones actualmente visibles de Nambre.",
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
            <span className="legal-page__eyebrow">Documento legal publico</span>
            <h1>{LEGAL_DOCUMENT_COPY.terms.title}</h1>
            <p>
              Este texto coincide con el contenido actualmente visible dentro del login de Nambre y
              queda pendiente de reemplazo por la version legal definitiva.
            </p>
          </div>
          <article className="legal-page__content">
            <p>{LEGAL_DOCUMENT_COPY.terms.body}</p>
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
