"use client";

import React, {useState} from "react";
import Link from "next/link";
import {Eye, EyeOff, LogIn} from "lucide-react";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {
  LegalAcceptanceRequiredError,
  LegalDocumentType,
  LegalStatus,
  login,
} from "@/lib/api";
import {Alert} from "@/components/ui/Alert";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";
import {Input} from "@/components/ui/Input";
import {LEGAL_DOCUMENT_COPY} from "@/lib/legal-copy";

const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentType, string> = {
  acceptable_use: "Uso aceptable",
  ai_policy: "Politica de IA",
  cookies_analytics: "Cookies y analitica",
  privacy: "Privacidad",
  terms: "Terminos",
};

export function LoginForm({onToken}: {onToken: (token: string) => void}) {
  const accessRequestUrl = process.env.NEXT_PUBLIC_ACCESS_REQUEST_URL?.trim();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAccessInfo, setShowAccessInfo] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptLegal, setAcceptLegal] = useState(false);
  const [legalStatus, setLegalStatus] = useState<LegalStatus | null>(null);
  const [openDocument, setOpenDocument] = useState<keyof typeof LEGAL_DOCUMENT_COPY | null>(null);

  const legalAcceptanceRequired = legalStatus?.requires_acceptance === true;
  const pendingLegalLabels = legalStatus?.pending_documents
    .filter((documentType) => documentType !== "terms" && documentType !== "privacy")
    .map((documentType) => LEGAL_DOCUMENT_LABELS[documentType]);

  function resetLegalRequirement() {
    setAcceptLegal(false);
    setLegalStatus(null);
    setOpenDocument(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onToken(await login(email, password, {acceptLegal}));
      resetLegalRequirement();
    } catch (err) {
      if (err instanceof LegalAcceptanceRequiredError) {
        setLegalStatus(err.legalStatus);
        setAcceptLegal(false);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-screen__backdrop" />
      <Card className="login-card">
        <NambreBrand className="login-card__brand" />
        <div className="login-card__header">
          <h1>Bienvenido de nuevo</h1>
          <p>Ingresá para administrar tu carta digital.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <Input
            autoComplete="email"
            disabled={loading}
            label="Email"
            onChange={(event) => {
              setEmail(event.target.value);
              if (legalAcceptanceRequired) {
                resetLegalRequirement();
              }
            }}
            placeholder="tu@email.com"
            type="email"
            value={email}
          />
          <Input
            autoComplete="current-password"
            disabled={loading}
            label="Contraseña"
            onChange={(event) => {
              setPassword(event.target.value);
              if (legalAcceptanceRequired) {
                resetLegalRequirement();
              }
            }}
            rightSlot={
              <button
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="field__toggle"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <div className="login-form__aux">
            <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
          </div>
          {legalAcceptanceRequired ? (
            <div className="login-legal" data-testid="login-legal-consent">
              <label className="login-legal__checkbox">
                <input
                  aria-label="Aceptar documentos legales vigentes"
                  checked={acceptLegal}
                  disabled={loading}
                  onChange={(event) => setAcceptLegal(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Acepto los{" "}
                  <button
                    className="login-legal__link"
                    onClick={() => setOpenDocument("terms")}
                    type="button"
                  >
                    Términos
                  </button>{" "}
                  y la{" "}
                  <button
                    className="login-legal__link"
                    onClick={() => setOpenDocument("privacy")}
                    type="button"
                  >
                    Política de privacidad
                  </button>{" "}
                  vigentes de Nambre.
                </span>
              </label>
              <p className="login-legal__hint">
                Esta aceptación se registra contra la versión vigente del paquete legal de Nambre.
                {pendingLegalLabels && pendingLegalLabels.length > 0
                  ? ` También incluye: ${pendingLegalLabels.join(", ")}.`
                  : ""}
              </p>
            </div>
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button
            disabled={
              loading ||
              !email.trim() ||
              !password.trim() ||
              (legalAcceptanceRequired && !acceptLegal)
            }
            type="submit"
          >
            <LogIn size={18} /> {loading ? "Ingresando..." : "Ingresar"}
          </Button>
          {accessRequestUrl ? (
            <a
              className="ui-button ui-button--ghost ui-button--sm login-card__request-access"
              href={accessRequestUrl}
              rel="noreferrer"
              target="_blank"
            >
              ¿Todavía no tenés cuenta? Solicitar acceso
            </a>
          ) : (
            <>
              <button
                className="ui-button ui-button--ghost ui-button--sm login-card__request-access"
                onClick={() => setShowAccessInfo((current) => !current)}
                type="button"
              >
                ¿Todavía no tenés cuenta? Solicitar acceso
              </button>
              {showAccessInfo ? (
                <Alert tone="info">
                  Durante el piloto el acceso se habilita manualmente. Coordiná el alta con el
                  equipo de Nambre antes de intentar iniciar sesión.
                </Alert>
              ) : null}
            </>
          )}
        </form>
        <div className="login-card__meta">
          <p className="login-card__footer">Tu carta, siempre al día.</p>
          <nav aria-label="Enlaces legales públicos" className="login-card__legal-links">
            <Link href="/terms">Terminos</Link>
            <Link href="/privacy">Privacidad</Link>
          </nav>
        </div>
      </Card>
      {openDocument ? (
        <div className="legal-modal" role="presentation">
          <button
            aria-label="Cerrar modal legal"
            className="legal-modal__backdrop"
            onClick={() => setOpenDocument(null)}
            type="button"
          />
          <Card
            aria-modal="true"
            className="legal-modal__card"
            role="dialog"
            aria-labelledby="legal-modal-title"
          >
            <div className="legal-modal__header">
              <div>
                <p className="legal-modal__eyebrow">Texto legal provisorio</p>
                <h2 id="legal-modal-title">{LEGAL_DOCUMENT_COPY[openDocument].title}</h2>
              </div>
              <Button onClick={() => setOpenDocument(null)} size="sm" variant="ghost">
                Cerrar
              </Button>
            </div>
            <p>{LEGAL_DOCUMENT_COPY[openDocument].body}</p>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
