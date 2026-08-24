"use client";

import React from "react";
import {ArrowLeft, Plus} from "lucide-react";
import {useCallback, useEffect, useState} from "react";
import {NambreBrand} from "@/components/brand/NambreBrand";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";
import {PageHeader} from "@/components/ui/PageHeader";
import {
  adminBusinessActions,
  businessDestinationErrorMessage,
  businessDestinationLabel,
  businessStatusLabel,
  Business,
  inviteClient,
  inviteClientErrorMessage,
  listBusinesses,
  request,
  updateBusinessDestination,
} from "@/lib/api";

export function AdminPanel({
  onReturnToOwner,
  token,
}: {
  onReturnToOwner?: () => void;
  token: string | null;
}) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [destinationDrafts, setDestinationDrafts] = useState<
    Record<string, {destination_type: "menu_pdf" | "external_url"; external_url: string}>
  >({});
  const [error, setError] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const items = await listBusinesses(token, true);
      setBusinesses(items);
      setDestinationDrafts(
        Object.fromEntries(
          items.map((item) => [
            item.id,
            {
              destination_type: item.destination_type === "external_url" ? "external_url" : "menu_pdf",
              external_url: item.external_url ?? "",
            },
          ]),
        ),
      );
    } catch {
      setError("No se pudieron cargar los negocios.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    setInviting(true);
    setError("");
    setInviteMessage("");
    try {
      const response = await inviteClient(token, name, email);
      setName("");
      setEmail("");
      setInviteMessage(response.message);
      await load();
    } catch (error: unknown) {
      setError(inviteClientErrorMessage(error));
    } finally {
      setInviting(false);
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

  async function updateDestination(businessId: string) {
    const draft = destinationDrafts[businessId];
    if (!draft) return;
    setSavingId(businessId);
    setError("");
    try {
      const updated = await updateBusinessDestination(
        token,
        businessId,
        {
          destination_type: draft.destination_type,
          external_url: draft.destination_type === "external_url" ? draft.external_url : undefined,
        },
        true,
      );
      setBusinesses((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setDestinationDrafts((current) => ({
        ...current,
        [businessId]: {
          destination_type: updated.destination_type === "external_url" ? "external_url" : "menu_pdf",
          external_url: updated.external_url ?? "",
        },
      }));
    } catch (destinationError: unknown) {
      setError(businessDestinationErrorMessage(destinationError));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="admin-shell">
      <div className="admin-shell__header">
        <div className="admin-shell__brand-block">
          <NambreBrand mode="admin" />
          <PageHeader
            subtitle="Capacidades reales disponibles para operación de la plataforma."
            title="Nambre Admin"
          />
        </div>
        <div className="actions">
          {onReturnToOwner ? (
            <Button onClick={onReturnToOwner} variant="secondary">
              <ArrowLeft size={16} /> Volver a Owner
            </Button>
          ) : null}
        </div>
      </div>
      <div className="admin-layout" data-testid="admin-layout">
        <Card className="admin-businesses-panel panel-stack" data-testid="admin-businesses-panel">
          <h2>NEGOCIOS</h2>
          {error ? <p className="error">{error}</p> : null}
          {loading ? <p className="muted">Cargando negocios...</p> : null}
          <div className="admin-business-list" data-testid="admin-business-list">
            {businesses.map((item) => (
              <div className="card business-admin-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <p className="muted">{businessStatusLabel(item.status)}</p>
                  <p className="muted">
                    Destino: {businessDestinationLabel(item.destination_type ?? "menu_pdf")}
                  </p>
                  {item.external_url ? <p className="muted">{item.external_url}</p> : null}
                </div>
                <div className="actions" style={{alignItems: "stretch", display: "grid", gap: "0.75rem"}}>
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
                  <select
                    className="ui-input"
                    disabled={savingId === item.id}
                    value={destinationDrafts[item.id]?.destination_type ?? "menu_pdf"}
                    onChange={(event) =>
                      setDestinationDrafts((current) => ({
                        ...current,
                        [item.id]: {
                          destination_type: event.target.value as "menu_pdf" | "external_url",
                          external_url: current[item.id]?.external_url ?? item.external_url ?? "",
                        },
                      }))
                    }
                  >
                    <option value="menu_pdf">Carta en Nambre</option>
                    <option value="external_url">Carta externa</option>
                  </select>
                  {(destinationDrafts[item.id]?.destination_type ?? "menu_pdf") === "external_url" ? (
                    <input
                      className="ui-input"
                      disabled={savingId === item.id}
                      placeholder="https://tu-carta.com/menu"
                      type="url"
                      value={destinationDrafts[item.id]?.external_url ?? ""}
                      onChange={(event) =>
                        setDestinationDrafts((current) => ({
                          ...current,
                          [item.id]: {
                            destination_type: current[item.id]?.destination_type ?? "external_url",
                            external_url: event.target.value,
                          },
                        }))
                      }
                    />
                  ) : null}
                  <Button
                    disabled={
                      savingId === item.id ||
                      (
                        (destinationDrafts[item.id]?.destination_type ?? "menu_pdf") === "external_url" &&
                        !(destinationDrafts[item.id]?.external_url ?? "").trim()
                      )
                    }
                    onClick={() => void updateDestination(item.id)}
                    variant="secondary"
                  >
                    {savingId === item.id ? "Guardando..." : "Guardar destino"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="admin-create-panel panel-stack" data-testid="admin-create-panel">
          <h2>INVITAR CLIENTE</h2>
          <p className="muted">
            Creamos el negocio, dejamos la cuenta pendiente y enviamos un email para que el
            cliente defina su propia contraseña.
          </p>
          <input
            className="ui-input"
            placeholder="Nombre del negocio"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="ui-input"
            placeholder="Email del cliente"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {inviteMessage ? <p className="success">{inviteMessage}</p> : null}
          <Button
            disabled={inviting || !name.trim() || !email.trim()}
            onClick={() => void invite()}
          >
            <Plus size={18} /> {inviting ? "Enviando..." : "Invitar cliente"}
          </Button>
        </Card>
      </div>
    </section>
  );
}
