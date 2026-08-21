"use client";

import React, {useState} from "react";
import {Eye, EyeOff, LogIn} from "lucide-react";
import {MenuFlowBrand} from "@/components/brand/MenuFlowBrand";
import {login} from "@/lib/api";
import {Alert} from "@/components/ui/Alert";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";
import {Input} from "@/components/ui/Input";

export function LoginForm({onToken}: {onToken: (token: string) => void}) {
  const accessRequestUrl = process.env.NEXT_PUBLIC_ACCESS_REQUEST_URL?.trim();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAccessInfo, setShowAccessInfo] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onToken(await login(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-screen__backdrop" />
      <Card className="login-card">
        <MenuFlowBrand className="login-card__brand" />
        <div className="login-card__header">
          <h1>Bienvenido de nuevo</h1>
          <p>Ingresá para administrar tu carta digital.</p>
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
          <Input
            autoComplete="current-password"
            disabled={loading}
            label="Contraseña"
            onChange={(event) => setPassword(event.target.value)}
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
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button disabled={loading || !email.trim() || !password.trim()} type="submit">
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
                  equipo de MenuFlow antes de intentar iniciar sesión.
                </Alert>
              ) : null}
            </>
          )}
        </form>
        <p className="login-card__footer">Tu carta. Tu QR. Siempre actualizado.</p>
      </Card>
    </main>
  );
}
