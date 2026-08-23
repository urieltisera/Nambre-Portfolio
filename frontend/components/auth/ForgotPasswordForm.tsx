"use client";

import React, {useState} from "react";
import Link from "next/link";
import {Mail} from "lucide-react";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {Alert} from "@/components/ui/Alert";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";
import {Input} from "@/components/ui/Input";
import {requestPasswordReset} from "@/lib/api";

const GENERIC_MESSAGE =
  "Si existe una cuenta asociada a ese correo, vas a recibir instrucciones para restablecer tu contraseña.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestPasswordReset(email);
      setMessage(GENERIC_MESSAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la solicitud.");
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
          <h1>Recuperar contraseña</h1>
          <p>Ingresá tu email y te enviaremos instrucciones para restablecer el acceso.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <Input
            autoComplete="email"
            disabled={loading}
            label="Email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@email.com"
            type="email"
            value={email}
          />
          {message ? <Alert tone="success">{message}</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button disabled={loading || !email.trim()} type="submit">
            <Mail size={18} /> {loading ? "Enviando..." : "Enviar instrucciones"}
          </Button>
          <Link className="ui-button ui-button--ghost ui-button--sm login-card__request-access" href="/">
            Volver al login
          </Link>
        </form>
      </Card>
    </main>
  );
}
