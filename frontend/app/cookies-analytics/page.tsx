import Link from "next/link";
import type {Metadata} from "next";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";
import {LegalDocumentView} from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Política de Cookies y Analítica",
  description: "Uso actual de cookies y métricas operativas en Nambre.",
  alternates: {
    canonical: "/cookies-analytics",
  },
};

export default function CookiesAnalyticsPage() {
  return (
    <AppearanceProvider>
      <main className="legal-page">
        <div className="legal-page__shell">
          <NambreBrand className="legal-page__brand" />
          <div className="legal-page__header">
            <span className="legal-page__eyebrow">Documento legal público</span>
            <h1>Política de Cookies y Analítica</h1>
            <p>Resumen del uso actual de sesiones, autenticación y medición operativa del QR.</p>
          </div>
          <article className="legal-page__content">
            <LegalDocumentView activeDocument="cookies_analytics" />
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
