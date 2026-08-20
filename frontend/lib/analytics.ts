import {DailyScan} from "@/lib/api";

export type AnalyticsWindow = 7 | 30;

export type ActivityPoint = {
  date: string;
  labelCompact: string;
  labelShort: string;
  labelTooltip: string;
  scans: number;
};

type ActivitySummary = {
  peakDayLabel: string;
  peakDayValue: number;
  total: number;
};

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-AR", options).format(parseDate(value));
}

export function sliceDailySeries(series: DailyScan[], window: AnalyticsWindow): DailyScan[] {
  return series.slice(Math.max(0, series.length - window));
}

export function toActivityPoints(series: DailyScan[]): ActivityPoint[] {
  return series.map((item) => ({
    date: item.date,
    labelCompact: formatDate(item.date, {day: "2-digit", month: "2-digit"}),
    labelShort: formatDate(item.date, {day: "2-digit", month: "short"}),
    labelTooltip: formatDate(item.date, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    scans: item.scans,
  }));
}

export function summarizeActivity(points: ActivityPoint[]): ActivitySummary {
  if (points.length === 0) {
    return {peakDayLabel: "—", peakDayValue: 0, total: 0};
  }

  let peak = points[0];
  let total = 0;
  for (const point of points) {
    total += point.scans;
    if (point.scans > peak.scans) {
      peak = point;
    }
  }

  return {
    peakDayLabel: peak.labelShort,
    peakDayValue: peak.scans,
    total,
  };
}
