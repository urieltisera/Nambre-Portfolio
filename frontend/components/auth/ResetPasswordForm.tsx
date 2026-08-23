"use client";

import React, {useMemo, useState} from "react";
import Link from "next/link";
import {KeyRound} from "lucide-react";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {Alert} from "@/components/ui/Alert";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";
import {Input} from "@/components/ui/Input";
import {confirmPasswordReset} from "@/lib/api";

export function ResetPasswordForm({initialToken}: {initialToken: string}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const missingToken = !initialToken.trim();
  const mismatch = useMemo(
    () => confirmPassword.length > 0 && password !== confirmPassword,
    [confirmPassword, password],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (missingToken) {
      setError("El enlace de recuperación es inválido o está incompleto.");
      return;
    }
    if (password !== confirmPassword) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      setMessage(await confirmPasswordReset(initialToken, password));
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la contraseña.");
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
          <h1>Nueva contraseña</h1>
          <p>Elegí una contraseña nueva para volver a ingresar a Nambre.</p>
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
            label="Confirmar nueva contraseña"
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            value={confirmPassword}
          />
          {missingToken ? (
            <Alert tone="danger">El enlace es inválido, expiró o ya fue utilizado.</Alert>
          ) : null}
          {!missingToken && mismatch ? (
            <Alert tone="danger">La confirmación no coincide con la nueva contraseña.</Alert>
          ) : null}
          {message ? <Alert tone="success">{message}</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button
            disabled={loading || missingToken || !password.trim() || !confirmPassword.trim() || mismatch}
            type="submit"
          >
            <KeyRound size={18} /> {loading ? "Actualizando..." : "Actualizar contraseña"}
          </Button>
          <Link className="ui-button ui-button--ghost ui-button--sm login-card__request-access" href="/">
            Volver al login
          </Link>
        </form>
      </Card>
    </main>
  );
}
