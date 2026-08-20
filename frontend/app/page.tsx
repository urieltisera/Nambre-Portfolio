"use client";

import React from "react";
import {useState} from "react";
import {AdminPanel} from "@/components/AdminPanel";
import {BusinessPanel} from "@/components/BusinessPanel";
import {LoginForm} from "@/components/LoginForm";
import {canAccessAdmin, currentUser, User} from "@/lib/api";

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState("");

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

  if (!token) return <><LoginForm onToken={handleToken} />{error ? <main className="shell"><p className="error">{error}</p></main> : null}</>;

  const canAdmin = canAccessAdmin(user);

  return (
    <>
      <div className="shell actions">
        <button className={!admin ? "active" : "secondary"} onClick={() => setAdmin(false)}>Negocio</button>
        {canAdmin ? <button className={admin ? "active" : "secondary"} onClick={() => setAdmin(true)}>Admin</button> : null}
      </div>
      {admin && canAdmin ? (
        <main className="shell"><AdminPanel token={token} /></main>
      ) : (
        <BusinessPanel isPlatformAdmin={canAdmin} token={token} />
      )}
    </>
  );
}
