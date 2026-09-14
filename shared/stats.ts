import { statusFromEvent, type Application } from "./types.js";
import type { StageSet } from "./stages.js";
import { chronological } from "./timeline.js";
import { daysBetween, parseDate, startOfDay, toISODate } from "./dates.js";

export type Stats = {
  active: number;
  applied: number;
  responded: number;
  /** 0..1, or null when nothing has been applied to yet. */
  responseRate: number | null;
  /** Median days from applied to first response, or null when no data. */
  medianDaysToResponse: number | null;
};

type Progress = { applied?: string; response?: string };

/**
 * Replay the status timeline and keep the dates that still stand.
 *
 * A move back to an earlier phase undoes what came after it: dropping to a
 * "waiting" stage clears a response recorded above it (the interview was a
 * mis-click, or the process restarted), and dropping to a "lead" stage clears
 * the apply too. Without this, an app that briefly touched a later stage counted
 * as a response forever.
 */
function progress(app: Application, stages: StageSet): Progress {
  let applied: string | undefined;
  let response: string | undefined;
  for (const e of chronological(app.events)) {
    const s = statusFromEvent(e, stages);
    if (s === undefined) continue;
    if (stages.isLead(s)) {
      applied = undefined;
      response = undefined;
    } else if (stages.isWaiting(s)) {
      // Keep the original apply date; re-applying does not restart the clock.
      applied ??= e.date;
      response = undefined;
    } else if (stages.isResponse(s)) {
      response ??= e.date;
    }
  }
  return { applied, response };
}

/** Date the app was sent, from the events timeline (fallback: appliedDate). */
export function appliedOn(app: Application, stages: StageSet): string | undefined {
  return progress(app, stages).applied ?? app.appliedDate;
}

/** Date the company first responded, ignoring responses a later demotion undid. */
export function firstResponseOn(app: Application, stages: StageSet): string | undefined {
  return progress(app, stages).response;
}

function everApplied(app: Application, stages: StageSet): boolean {
  return appliedOn(app, stages) !== undefined || stages.impliesApplied(app.status);
}

function everResponded(app: Application, stages: StageSet): boolean {
  return firstResponseOn(app, stages) !== undefined || stages.isResponse(app.status);
}

export type WeekBucket = { weekStart: string; applied: number; responses: number };

/** Applications sent and first responses received per week, oldest first. */
export function weeklyFunnel(apps: readonly Application[], stages: StageSet, weeks: number, now: Date = new Date()): WeekBucket[] {
  const start = startOfDay(now);
  // Weeks start on Monday.
  const dow = (start.getDay() + 6) % 7;
  const thisMonday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - dow);
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7 * i);
    buckets.push({ weekStart: toISODate(d), applied: 0, responses: 0 });
  }
  const first = parseDate(buckets[0]?.weekStart);
  if (!first) return buckets;
  const index = (iso: string | undefined): number => {
    const d = parseDate(iso);
    if (!d) return -1;
    const days = daysBetween(first, d);
    if (days < 0) return -1;
    const i = Math.floor(days / 7);
    return i < buckets.length ? i : -1;
  };
  for (const app of apps) {
    const a = index(appliedOn(app, stages));
    const b = buckets[a];
    if (b) b.applied++;
    const r = index(firstResponseOn(app, stages));
    const rb = buckets[r];
    if (rb) rb.responses++;
  }
  return buckets;
}

export function computeStats(apps: readonly Application[], stages: StageSet): Stats {
  const active = apps.filter((a) => !stages.isClosed(a.status)).length;
  const appliedApps = apps.filter((a) => everApplied(a, stages));
  const respondedApps = appliedApps.filter((a) => everResponded(a, stages));

  const durations: number[] = [];
  for (const app of respondedApps) {
    const a = parseDate(appliedOn(app, stages));
    const r = parseDate(firstResponseOn(app, stages));
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
