import React from "react";
import {ExternalLink} from "lucide-react";
import {Badge} from "@/components/ui/Badge";
import type {BusinessDestination, BusinessPlanKey} from "@/lib/api";

type BadgeTone = "neutral" | "success" | "warning" | "danger";

export function DashboardHeader({
  businessName,
  businessStatus,
  destinationLabel,
  menuStatus,
  plan,
  publicCode,
  statusTone,
  updatedLabel,
}: {
  businessName: string;
  businessStatus: string;
  destinationLabel: string;
  menuStatus: string;
  plan: BusinessPlanKey | undefined;
  publicCode: string | null;
  statusTone: BadgeTone;
  updatedLabel: string;
}) {
  return (
    <header className="dashboard-header">
      <div className="dashboard-header__title">
        <span className="dashboard-header__eyebrow">Inicio operativo</span>
        <h1>{businessName}</h1>
        <p>Estado central de tu carta, QR y actividad reciente.</p>
      </div>
      <div className="dashboard-header__status" aria-label="Estado del negocio">
        <Badge tone={statusTone}>{businessStatus}</Badge>
        <DashboardFact label="Plan" value={planLabel(plan)} />
        <DashboardFact label="Destino" value={destinationLabel} />
        <DashboardFact label="Carta" value={menuStatus} />
        <DashboardFact label="Actualización" value={updatedLabel} />
        <DashboardFact
          label="Link público"
          value={
            publicCode ? (
              <span className="dashboard-header__link-value">
                /r/{publicCode}
                <ExternalLink aria-hidden="true" size={15} />
              </span>
            ) : (
              "Sin link publicado"
            )
          }
        />
      </div>
    </header>
  );
}

function DashboardFact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="dashboard-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function planLabel(plan: BusinessPlanKey | undefined) {
  if (plan === "premium") return "Premium";
  if (plan === "essential") return "Essential";
  return "Sin plan asignado";
}

export function dashboardDestinationLabel(destination: BusinessDestination) {
  if (destination === "digital_menu") return "Carta Nambre";
  if (destination === "external_url") return "URL externa";
  return "PDF";
}
