"use client";

import React from "react";
import {useState} from "react";
import {AdminPanel} from "@/components/AdminPanel";
import {BusinessPanel} from "@/components/BusinessPanel";
import {LoginForm} from "@/components/LoginForm";
import {Alert} from "@/components/ui/Alert";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";
import {Button} from "@/components/ui/Button";
import {canAccessAdmin, currentUser, logout, User} from "@/lib/api";

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleToken(nextToken: string) {
    setError("");
    setToken(nextToken);
    try {
      const me = await currentUser(nextToken);
      setUser(me);
      setAdmin(me.is_platform_admin);
    } catch {
      setToken(null);
      setUser(null);
      setAdmin(false);
      setError("No se pudo cargar el usuario actual.");
    }
  }

  async function handleLogout() {
    if (!token) return;
    setLoggingOut(true);
    try {
      await logout(token);
    } catch {
      // El backend actual responde 204 sin estado servidor; limpiamos cliente igual.
    } finally {
      setToken(null);
      setUser(null);
      setAdmin(false);
      setError("");
      setLoggingOut(false);
    }
  }

  if (!token) {
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
            onLogout={handleLogout}
            onReturnToOwner={() => setAdmin(false)}
            token={token}
          />
        </main>
      ) : (
        <BusinessPanel
          isPlatformAdmin={canAdmin}
          onLogout={handleLogout}
          onOpenAdmin={canAdmin ? () => setAdmin(true) : undefined}
          token={token}
          user={user}
        />
      )}
    </AppearanceProvider>
  );
}
