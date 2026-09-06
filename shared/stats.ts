import {
  CLOSED_STAGES,
  RESPONSE_STAGES,
  statusFromEventLabel,
  type Application,
  type Status,
} from "./types.js";
import { daysBetween, parseDate } from "./dates.js";

export type Stats = {
  active: number;
  applied: number;
  responded: number;
  /** 0..1, or null when nothing has been applied to yet. */
  responseRate: number | null;
  /** Median days from applied to first response, or null when no data. */
  medianDaysToResponse: number | null;
};

const APPLIED_OR_LATER: readonly Status[] = ["applied", ...RESPONSE_STAGES];

/** Date the app entered `applied`, from the events timeline (fallback: appliedDate). */
export function appliedOn(app: Application): string | undefined {
  const sorted = [...app.events].sort((a, b) => a.date.localeCompare(b.date));
  const ev = sorted.find((e) => statusFromEventLabel(e.label) === "applied");
  return ev?.date ?? app.appliedDate;
}

/** Date of the first event that moved the app into a response stage. */
export function firstResponseOn(app: Application): string | undefined {
  const sorted = [...app.events].sort((a, b) => a.date.localeCompare(b.date));
  const ev = sorted.find((e) => {
    const s = statusFromEventLabel(e.label);
    return s !== undefined && RESPONSE_STAGES.includes(s);
  });
  return ev?.date;
}

function everApplied(app: Application): boolean {
  return appliedOn(app) !== undefined || APPLIED_OR_LATER.includes(app.status);
}

function everResponded(app: Application): boolean {
  return firstResponseOn(app) !== undefined || RESPONSE_STAGES.includes(app.status);
}

export function computeStats(apps: readonly Application[]): Stats {
  const active = apps.filter((a) => !CLOSED_STAGES.includes(a.status)).length;
  const appliedApps = apps.filter(everApplied);
  const respondedApps = appliedApps.filter(everResponded);

  const durations: number[] = [];
  for (const app of respondedApps) {
    const a = parseDate(appliedOn(app));
    const r = parseDate(firstResponseOn(app));
    if (a && r) durations.push(Math.max(0, daysBetween(a, r)));
  }
  durations.sort((x, y) => x - y);
  let median: number | null = null;
  if (durations.length > 0) {
    const mid = Math.floor(durations.length / 2);
    const lo = durations[mid - 1];
    const hi = durations[mid];
    median = durations.length % 2 === 0 && lo !== undefined && hi !== undefined ? (lo + hi) / 2 : (hi ?? null);
  }

  return {
    active,
    applied: appliedApps.length,
    responded: respondedApps.length,
    responseRate: appliedApps.length === 0 ? null : respondedApps.length / appliedApps.length,
    medianDaysToResponse: median,
  };
}
