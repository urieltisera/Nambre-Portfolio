"use client";

import React, {useEffect, useMemo, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {KeyRound} from "lucide-react";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {Alert} from "@/components/ui/Alert";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";
import {Input} from "@/components/ui/Input";
import {acceptInvitation, LegalDocumentType} from "@/lib/api";
import {LEGAL_DOCUMENT_LABELS} from "@/lib/legal-copy";
import {LegalModal} from "@/components/legal/LegalModal";

export function ActivateAccountForm({initialToken}: {initialToken: string}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptLegal, setAcceptLegal] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [openDocument, setOpenDocument] = useState<LegalDocumentType | null>(null);

  const missingToken = !initialToken.trim();
  const mismatch = useMemo(
    () => confirmPassword.length > 0 && password !== confirmPassword,
    [confirmPassword, password],
  );

  useEffect(() => {
    if (!message) return;
    const timeoutId = window.setTimeout(() => {
      router.replace("/");
    }, 1500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [message, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (missingToken) {
      setError("La invitación es inválida, expiró o ya fue utilizada.");
      return;
    }
    if (password !== confirmPassword) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    if (!acceptLegal) {
      setError("Necesitás aceptar los documentos legales vigentes para activar la cuenta.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      setMessage(await acceptInvitation(initialToken, password, acceptLegal));
      setPassword("");
      setConfirmPassword("");
      setAcceptLegal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo activar la cuenta.");
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
          <h1>Activá tu cuenta</h1>
          <p>Definí tu contraseña y aceptá los documentos vigentes para ingresar a Nambre.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <Input
            autoComplete="new-password"
            disabled={loading}
            label="Nueva contraseña"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
          <Input
            autoComplete="new-password"
            disabled={loading}
            label="Confirmar contraseña"
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            value={confirmPassword}
          />
          <div className="login-legal" data-testid="activation-legal-consent">
            <label className="login-legal__checkbox">
              <input
                aria-label="Aceptar documentos legales vigentes para activar la cuenta"
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
              Esta aceptación también incluye:{" "}
              {(["acceptable_use", "cookies_analytics", "ai_policy"] as LegalDocumentType[])
                .map((documentType) => LEGAL_DOCUMENT_LABELS[documentType])
                .join(", ")}
              .
            </p>
          </div>
          {missingToken ? (
            <Alert tone="danger">
              La invitación es inválida, expiró o ya fue utilizada. Pedile a tu admin una nueva
              invitación.
            </Alert>
          ) : null}
          {!missingToken && mismatch ? (
            <Alert tone="danger">La confirmación no coincide con la nueva contraseña.</Alert>
          ) : null}
          {message ? <Alert tone="success">{message}</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button
            disabled={
              loading ||
              missingToken ||
              !password.trim() ||
              !confirmPassword.trim() ||
              mismatch ||
              !acceptLegal
            }
            type="submit"
          >
            <KeyRound size={18} /> {loading ? "Activando..." : "Crear contraseña"}
          </Button>
          <Link className="ui-button ui-button--ghost ui-button--sm login-card__request-access" href="/">
            Volver al login
          </Link>
        </form>
        {openDocument ? <LegalModal documentType={openDocument} onClose={() => setOpenDocument(null)} /> : null}
      </Card>
    </main>
  );
}
