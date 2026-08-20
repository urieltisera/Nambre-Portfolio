"use client";

import React from "react";
import {Plus} from "lucide-react";
import {useCallback, useEffect, useState} from "react";
import {
  adminBusinessActions,
  businessStatusLabel,
  Business,
  createBusinessErrorMessage,
  listBusinesses,
  request,
  slugifyBusinessName,
} from "@/lib/api";

export function AdminPanel({token}: {token: string}) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [owner, setOwner] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Business["status"]>("active");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBusinesses(await listBusinesses(token, true));
    } catch {
      setError("No se pudieron cargar los negocios.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setCreating(true);
    setError("");
    try {
      const business = await request<Business>("/admin/businesses", token, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name, slug, status}),
      });
      if (owner && password) {
        await request(`/admin/businesses/${business.id}/owner`, token, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({email: owner, password, role: "owner"}),
        });
      }
      setName("");
      setSlug("");
      setSlugTouched(false);
      setOwner("");
      setPassword("");
      await load();
    } catch (error: unknown) {
      setError(createBusinessErrorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(businessId: string, nextStatus: Business["status"]) {
    setSavingId(businessId);
    setError("");
    try {
      const updated = await request<Business>(`/admin/businesses/${businessId}`, token, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({status: nextStatus}),
      });
      setBusinesses((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      setError("No se pudo actualizar el estado del negocio.");
    } finally {
      setSavingId(null);
    }
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugifyBusinessName(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(value);
  }

  return (
    <section className="admin-layout" data-testid="admin-layout">
      <div className="panel grid admin-businesses-panel" data-testid="admin-businesses-panel">
        <h2>NEGOCIOS</h2>
        {error ? <p className="error">{error}</p> : null}
        {loading ? <p className="muted">Cargando negocios...</p> : null}
        <div className="admin-business-list" data-testid="admin-business-list">
          {businesses.map((item) => (
            <div className="card business-admin-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <p className="muted">{businessStatusLabel(item.status)}</p>
              </div>
              <div className="actions">
                {adminBusinessActions(item.status).map((action) => (
                  <button
                    className={action.nextStatus === "suspended" ? "secondary" : ""}
                    disabled={savingId === item.id}
                    key={action.label}
                    onClick={() => void updateStatus(item.id, action.nextStatus)}
                  >
                    {savingId === item.id ? "Guardando..." : action.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel grid admin-create-panel" data-testid="admin-create-panel">
        <h2>CREAR NEGOCIO</h2>
        <input placeholder="Nombre" value={name} onChange={(event) => handleNameChange(event.target.value)} />
        <input placeholder="Slug" value={slug} onChange={(event) => handleSlugChange(event.target.value)} />
        <input placeholder="Owner email" value={owner} onChange={(event) => setOwner(event.target.value)} />
        <input placeholder="Password owner" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <select value={status} onChange={(event) => setStatus(event.target.value as Business["status"])}>
          <option value="active">Activo</option>
          <option value="demo">Demo</option>
          <option value="suspended">Suspendido</option>
        </select>
        <button disabled={creating || !name.trim() || !slug.trim()} onClick={() => void create()}>
          <Plus size={18} /> {creating ? "Creando..." : "Crear negocio"}
        </button>
      </div>
    </section>
  );
}
