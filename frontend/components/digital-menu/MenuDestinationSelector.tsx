"use client";

import React from "react";
import {ArrowUpRight} from "lucide-react";
import {Alert} from "@/components/ui/Alert";
import {Badge} from "@/components/ui/Badge";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";
import {
  Business,
  BusinessDestination,
  businessDestinationLabel,
  businessPlanLabel,
} from "@/lib/api";

export function MenuDestinationSelector({
  business,
  canActivateDigitalMenu = true,
  canUseDigitalMenu = false,
  canMutate,
  externalUrl,
  message,
  onExternalUrlChange,
  onOpenExternalUrl,
  onSave,
  onValueChange,
  saving,
  value,
}: {
  business: Business;
  canActivateDigitalMenu?: boolean;
  canUseDigitalMenu?: boolean;
  canMutate: boolean;
  externalUrl: string;
  message: string;
  onExternalUrlChange: (value: string) => void;
  onOpenExternalUrl: () => void;
  onSave: () => Promise<void> | void;
  onValueChange: (value: BusinessDestination) => void;
  saving: boolean;
  value: BusinessDestination;
}) {
  return (
    <Card className="panel-stack">
      <div className="owner-compact-card__topline">
        <div>
          <h2>Modalidad actual</h2>
          <p className="muted">
            Hoy tu negocio usa: {businessDestinationLabel(business.destination_type ?? "menu_pdf")}
          </p>
          <p className="muted">Plan actual: {businessPlanLabel(business.plan_key)}</p>
        </div>
        <Badge tone={canUseDigitalMenu ? "success" : "warning"}>
          {canUseDigitalMenu ? "Premium" : "Essential"}
        </Badge>
      </div>
      <div className="digital-menu-mode-list" role="radiogroup" aria-label="Modalidad de carta">
        <label className="digital-menu-mode">
          <input
            checked={value === "menu_pdf"}
            disabled={!canMutate || saving}
            name="menu-destination"
            onChange={() => onValueChange("menu_pdf")}
            type="radio"
          />
          <span>
            <strong>PDF</strong>
            <small>Subí o reemplazá un PDF alojado en Nambre.</small>
          </span>
        </label>
        <label className="digital-menu-mode">
          <input
            checked={value === "external_url"}
            disabled={!canMutate || saving}
            name="menu-destination"
            onChange={() => onValueChange("external_url")}
            type="radio"
          />
          <span>
            <strong>Carta digital propia</strong>
            <small>Redirigí tu QR a una URL externa del negocio.</small>
          </span>
        </label>
        <label className="digital-menu-mode">
          <input
            checked={value === "digital_menu"}
            disabled={!canMutate || saving || !canUseDigitalMenu}
            name="menu-destination"
            onChange={() => onValueChange("digital_menu")}
            type="radio"
          />
          <span>
            <strong>Carta Nambre</strong>
            <small>
              {canUseDigitalMenu
                ? "Gestioná categorías, productos y precios desde el dashboard."
                : "Creá una carta digital completa con categorías, productos y gestión desde Nambre."}
            </small>
          </span>
        </label>
      </div>
      {!canUseDigitalMenu ? (
        <Card className="panel-stack" data-testid="digital-menu-premium-lock">
          <div className="owner-compact-card__topline">
            <strong>Carta Nambre</strong>
            <Badge tone="warning">Premium</Badge>
          </div>
          <p className="muted">
            Creá una carta digital completa con categorías, productos y gestión desde Nambre.
          </p>
          <p className="muted">Disponible en Premium.</p>
        </Card>
      ) : null}
      {value === "external_url" ? (
        <label className="field">
          <span className="field__label">URL de tu carta</span>
          <input
            className="ui-input"
            disabled={!canMutate || saving}
            onChange={(event) => onExternalUrlChange(event.target.value)}
            placeholder="https://tu-carta.com/menu"
            type="url"
            value={externalUrl}
          />
        </label>
      ) : null}
      {value === "digital_menu" && canUseDigitalMenu && !canActivateDigitalMenu ? (
        <Alert tone="warning">
          Primero creá tu Carta Nambre para poder dejarla como modalidad activa.
        </Alert>
      ) : null}
      <div className="actions">
        <Button
          disabled={
            !canMutate ||
            saving ||
            (value === "external_url" && !externalUrl.trim()) ||
            (value === "digital_menu" && (!canUseDigitalMenu || !canActivateDigitalMenu))
          }
          onClick={() => void onSave()}
        >
          {saving ? "Guardando..." : "Guardar modalidad"}
        </Button>
        <Button
          disabled={
            (business.destination_type ?? "menu_pdf") !== "external_url" || !business.external_url
          }
          onClick={onOpenExternalUrl}
          variant="secondary"
        >
          <ArrowUpRight size={16} /> Abrir enlace actual
        </Button>
      </div>
      {message ? (
        <Alert tone={message.includes("correctamente") ? "success" : "danger"}>{message}</Alert>
      ) : null}
    </Card>
  );
}
