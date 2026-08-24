"use client";

import React from "react";
import {useEffect, useState} from "react";
import {AdminPanel} from "@/components/AdminPanel";
import {BusinessPanel} from "@/components/BusinessPanel";
import {LoginForm} from "@/components/auth/LoginForm";
import {Alert} from "@/components/ui/Alert";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";
import {Button} from "@/components/ui/Button";
import {LoadingState} from "@/components/ui/LoadingState";
import {
  ApiError,
  canAccessAdmin,
  currentUser,
  logout,
  User,
} from "@/lib/api";

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const me = await currentUser();
        if (cancelled) return;
        setUser(me);
        setAdmin(me.is_platform_admin);
        setError("");
      } catch (err) {
        if (cancelled) return;
        setToken(null);
        setUser(null);
        setAdmin(false);
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
  }, []);

  async function handleToken(nextToken: string | null) {
    setError("");
    setToken(nextToken);
    try {
      const me = await currentUser(nextToken);
      setUser(me);
      setAdmin(me.is_platform_admin);
      setCheckingSession(false);
    } catch {
      setToken(null);
      setUser(null);
      setAdmin(false);
      setCheckingSession(false);
      setError("No se pudo cargar el usuario actual.");
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout(token);
    } catch {
      // Si el backend no responde, igualmente limpiamos el shell local.
    } finally {
      setToken(null);
      setUser(null);
      setAdmin(false);
      setError("");
      setCheckingSession(false);
      setLoggingOut(false);
    }
  }

  if (checkingSession) {
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

  if (!user) {
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

  const canAdmin = canAccessAdmin(user);

  return (
    <AppearanceProvider key={user?.id ?? "guest"} userId={user?.id ?? null}>
      {canAdmin ? (
        <div className="mode-switch">
          <div className="mode-switch__group">
            <Button onClick={() => setAdmin(false)} variant={!admin ? "primary" : "secondary"}>
              Owner
            </Button>
            <Button onClick={() => setAdmin(true)} variant={admin ? "primary" : "secondary"}>
              Admin
            </Button>
          </div>
          <Button disabled={loggingOut} onClick={() => void handleLogout()} variant="ghost">
            {loggingOut ? "Cerrando..." : "Cerrar sesión"}
          </Button>
        </div>
      ) : null}
      {admin && canAdmin ? (
        <main className="page-frame">
          <AdminPanel
            onReturnToOwner={() => setAdmin(false)}
            token={token}
          />
        </main>
      ) : (
        <BusinessPanel
          isPlatformAdmin={canAdmin}
          onLogout={handleLogout}
          onOpenAdmin={canAdmin ? () => setAdmin(true) : undefined}
          onSessionRefresh={handleToken}
          token={token}
          user={user}
        />
      )}
    </AppearanceProvider>
  );
}
