import React from "react";
import {Card} from "@/components/ui/Card";

export function DashboardMetricsGrid({
  busiestHour,
  scans7d,
  scans30d,
  scansToday,
}: {
  busiestHour: string;
  scans7d: number;
  scans30d: number;
  scansToday: number;
}) {
  const metrics = [
    {helper: "Visitas del día", label: "Hoy", value: scansToday},
    {helper: "Última semana", label: "7 días", value: scans7d},
    {helper: "Ventana completa", label: "30 días", value: scans30d},
    {helper: "Últimos 30 días", label: "Hora pico", value: busiestHour},
  ];

  return (
    <section className="dashboard-metrics" aria-labelledby="dashboard-metrics-title">
      <div className="dashboard-section-heading">
        <h2 id="dashboard-metrics-title">Métricas operativas</h2>
      </div>
      <div className="dashboard-metrics__grid">
        {metrics.map((metric) => (
          <Card className="dashboard-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.helper}</small>
          </Card>
        ))}
      </div>
    </section>
  );
}
