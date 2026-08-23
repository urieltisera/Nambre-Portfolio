import Link from "next/link";
import type { Metadata } from "next";
import { NambreBrand } from "@/components/brand/NambreBrand";
import { AppearanceProvider } from "@/components/ui/AppearanceProvider";

export const metadata: Metadata = {
  title: "Pagina no encontrada",
  robots: {
    follow: false,
    index: false,
  },
};

export default function NotFound() {
  return (
    <AppearanceProvider>
      <main className="status-screen">
        <div className="status-screen__card">
          <NambreBrand className="status-screen__brand" />
          <span className="status-screen__eyebrow">Error 404</span>
          <h1>No encontramos esa pagina.</h1>
          <p>
            La ruta que buscaste no esta disponible en Nambre o ya no forma parte de la superficie
            publica.
          </p>
          <div className="status-screen__actions">
            <Link className="ui-button ui-button--primary" href="/">
              Volver al inicio
            </Link>
            <Link className="ui-button ui-button--ghost" href="/terms">
              Ver terminos
            </Link>
          </div>
        </div>
      </main>
    </AppearanceProvider>
  );
}
