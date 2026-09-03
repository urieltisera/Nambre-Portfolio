import React from "react";
import {BarChart3, FileUp, QrCode, Store} from "lucide-react";
import {Button} from "@/components/ui/Button";

export function DashboardActions({
  onOpenAnalytics,
  onOpenBusiness,
  onOpenMenu,
  onOpenQr,
}: {
  onOpenAnalytics: () => void;
  onOpenBusiness: () => void;
  onOpenMenu: () => void;
  onOpenQr: () => void;
}) {
  return (
    <section className="dashboard-actions" aria-labelledby="dashboard-actions-title">
      <div className="dashboard-section-heading">
        <h2 id="dashboard-actions-title">Acciones rápidas</h2>
      </div>
      <div className="dashboard-actions__grid">
        <Button className="dashboard-action" onClick={onOpenMenu} variant="secondary">
          <FileUp size={18} />
          <span>Editar carta</span>
        </Button>
        <Button className="dashboard-action" onClick={onOpenQr} variant="secondary">
          <QrCode size={18} />
          <span>Ver QR</span>
        </Button>
        <Button className="dashboard-action" onClick={onOpenBusiness} variant="secondary">
          <Store size={18} />
          <span>Configurar negocio</span>
        </Button>
        <Button className="dashboard-action" onClick={onOpenAnalytics} variant="secondary">
          <BarChart3 size={18} />
          <span>Ver analíticas</span>
        </Button>
      </div>
    </section>
  );
}
