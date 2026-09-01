"use client";

import React from "react";
import {useRouter} from "next/navigation";
import {useEffect, useState} from "react";
import {LoginForm} from "@/components/auth/LoginForm";
import {Alert} from "@/components/ui/Alert";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";
import {LoadingState} from "@/components/ui/LoadingState";
import {
  ApiError,
  currentUser,
  User,
} from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [, setToken] = useState<string | null>(null);
  const [, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const me = await currentUser();
        if (cancelled) return;
        setUser(me);
        setError("");
        setRedirecting(true);
        router.replace("/dashboard");
      } catch (err) {
        if (cancelled) return;
        setToken(null);
        setUser(null);
        if (!(err instanceof ApiError && err.status === 401)) {
          setError("No se pudo restaurar la sesión actual.");
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleToken(nextToken: string | null) {
    setError("");
    setToken(nextToken);
    try {
      const me = await currentUser(nextToken);
      setUser(me);
      setRedirecting(true);
      setCheckingSession(false);
      router.replace("/dashboard");
    } catch {
      setToken(null);
      setUser(null);
      setCheckingSession(false);
      setError("No se pudo cargar el usuario actual.");
    }
  }

  if (checkingSession || redirecting) {
    return (
      <AppearanceProvider key="bootstrapping">
        <main className="page-frame page-frame--narrow">
          <LoadingState
            message="Estamos validando tu sesión para evitar interrupciones al refrescar."
            title="Recuperando acceso"
          />
        </main>
      </AppearanceProvider>
    );
  }

  return (
    <AppearanceProvider key="guest">
      <LoginForm onToken={handleToken} />
      {error ? (
        <main className="page-frame page-frame--narrow">
          <Alert tone="danger">{error}</Alert>
        </main>
      ) : null}
    </AppearanceProvider>
  );
}
