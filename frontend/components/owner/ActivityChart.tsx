"use client";

import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {Card} from "@/components/ui/Card";
import {AnalyticsWindow, ActivityPoint, summarizeActivity} from "@/lib/analytics";
import {cn} from "@/lib/cn";

type ActivityChartProps = {
  contained?: boolean;
  description?: string;
  emptyDescription: string;
  emptyTitle: string;
  points: ActivityPoint[];
  title: string;
  variant?: "compact" | "full";
  window?: AnalyticsWindow;
  onWindowChange?: (window: AnalyticsWindow) => void;
};

export function ActivityChart({
  contained = true,
  description,
  emptyDescription,
  emptyTitle,
  onWindowChange,
  points,
  title,
  variant = "full",
  window = 7,
}: ActivityChartProps) {
  const summary = summarizeActivity(points);

  const content = (
    <div className={cn("activity-chart-card", `activity-chart-card--${variant}`)}>
      <div className="activity-chart__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {onWindowChange ? (
          <div
            aria-label="Ventana de actividad"
            className="activity-chart__switch"
            role="tablist"
          >
            {[7, 30].map((value) => (
              <button
                aria-selected={window === value}
                className={cn(
                  "activity-chart__switch-button",
                  window === value ? "is-active" : "",
                )}
                key={value}
                onClick={() => onWindowChange(value as AnalyticsWindow)}
                role="tab"
                type="button"
              >
                {value} días
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {points.length > 0 ? (
        <>
          <div className="activity-chart__summary" data-testid="activity-chart-summary">
            <div>
              <span>Total</span>
              <strong>{summary.total}</strong>
            </div>
            <div>
              <span>Mejor día</span>
              <strong>
                {summary.peakDayLabel} · {summary.peakDayValue}
              </strong>
            </div>
          </div>
          <div className="activity-chart__canvas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{bottom: 8, left: 0, right: 8, top: 8}}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  minTickGap={20}
                  tick={{fill: "var(--text-secondary)", fontSize: 12}}
                  tickFormatter={(_, index) =>
                    points[index]?.[variant === "compact" ? "labelCompact" : "labelShort"] ?? ""
                  }
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tick={{fill: "var(--text-secondary)", fontSize: 12}}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  content={({active, payload}) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0]?.payload as ActivityPoint | undefined;
                    if (!point) return null;
                    return (
                      <div className="activity-chart__tooltip">
                        <strong>{point.labelTooltip}</strong>
                        <span>{point.scans} visualizaciones</span>
                      </div>
                    );
                  }}
                  cursor={{stroke: "var(--chart-line-soft)", strokeWidth: 1}}
                />
                <Line
                  activeDot={{fill: "var(--chart-line)", r: 5, stroke: "var(--surface)", strokeWidth: 2}}
                  dataKey="scans"
                  dot={{fill: "var(--chart-line)", r: 2.5, stroke: "var(--surface)", strokeWidth: 1.5}}
                  stroke="var(--chart-line)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="activity-chart__empty">
          <strong>{emptyTitle}</strong>
          <p>{emptyDescription}</p>
        </div>
      )}
    </div>
  );

  return contained ? <Card>{content}</Card> : content;
}
