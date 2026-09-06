import type { VercelRequest, VercelResponse } from "@vercel/node";
import { attentionReasons, describeReason, isSnoozed } from "../../shared/attention.js";
import { daysBetween, parseDate } from "../../shared/dates.js";
import { computeStats } from "../../shared/stats.js";
import { CLOSED_STAGES, STATUSES, todayISO, type Application, type Contact, type Status } from "../../shared/types.js";
import { openDb } from "../_db.js";
import { queryParam, route } from "../_http.js";
import { getOwnerId, HttpError } from "../_owner.js";
import { loadAll } from "./_load.js";

type Ref = { id: string; company: string; role: string; status: Status; url?: string };

export type Digest = {
  generatedAt: string;
  today: string;
  counts: { total: number; active: number; needsAttention: number; snoozed: number };
  pipeline: Record<Status, number>;
  stats: ReturnType<typeof computeStats>;
  needsAttention: (Ref & { reasons: string[]; nextAction?: string; nextActionDate?: string; deadline?: string; updatedAt: string; contacts?: Contact[] })[];
  /** Muted by the user until the given date; excluded from needsAttention. */
  snoozed: (Ref & { snoozedUntil: string })[];
  upcomingDeadlines: (Ref & { deadline: string; daysUntil: number })[];
  nextActions: (Ref & { nextAction?: string; nextActionDate: string; daysUntil: number })[];
  recentActivity: (Ref & { date: string; label: string })[];
};

function ref(a: Application): Ref {
  const r: Ref = { id: a.id, company: a.company, role: a.role, status: a.status };
  if (a.url) r.url = a.url;
  return r;
}

export function buildDigest(apps: Application[], now: Date, activityDays: number, horizonDays: number): Digest {
  const today = todayISO();
  const pipeline = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const a of apps) pipeline[a.status]++;

  const needsAttention = apps
    .map((a) => ({ a, reasons: attentionReasons(a, now) }))
    .filter((x) => x.reasons.length > 0)
    .map(({ a, reasons }) => ({
      ...ref(a),
      reasons: reasons.map(describeReason),
      ...(a.nextAction ? { nextAction: a.nextAction } : {}),
      ...(a.nextActionDate ? { nextActionDate: a.nextActionDate } : {}),
      ...(a.deadline ? { deadline: a.deadline } : {}),
      updatedAt: a.updatedAt,
      ...(a.contacts && a.contacts.length ? { contacts: a.contacts } : {}),
    }));

  const snoozed = apps.filter((a) => isSnoozed(a, now) && a.snoozedUntil).map((a) => ({ ...ref(a), snoozedUntil: a.snoozedUntil ?? "" }));

  const upcomingDeadlines = apps
    .flatMap((a) => {
      const d = parseDate(a.deadline);
      if (!d || CLOSED_STAGES.includes(a.status) || !a.deadline) return [];
      const daysUntil = daysBetween(now, d);
      return daysUntil >= 0 && daysUntil <= horizonDays ? [{ ...ref(a), deadline: a.deadline, daysUntil }] : [];
    })
    .sort((x, y) => x.daysUntil - y.daysUntil);

  const nextActions = apps
    .flatMap((a) => {
      const d = parseDate(a.nextActionDate);
      if (!d || !a.nextActionDate) return [];
      const daysUntil = daysBetween(now, d);
      return daysUntil <= horizonDays ? [{ ...ref(a), ...(a.nextAction ? { nextAction: a.nextAction } : {}), nextActionDate: a.nextActionDate, daysUntil }] : [];
    })
    .sort((x, y) => x.daysUntil - y.daysUntil);

  const recentActivity = apps
    .flatMap((a) =>
      a.events
        .filter((e) => {
          const d = parseDate(e.date);
          return d !== undefined && daysBetween(d, now) <= activityDays && daysBetween(d, now) >= 0;
        })
        .map((e) => ({ ...ref(a), date: e.date, label: e.label })),
    )
    .sort((x, y) => y.date.localeCompare(x.date));

  return {
    generatedAt: now.toISOString(),
    today,
    counts: { total: apps.length, active: apps.filter((a) => !CLOSED_STAGES.includes(a.status)).length, needsAttention: needsAttention.length, snoozed: snoozed.length },
    pipeline,
    stats: computeStats(apps),
    needsAttention,
    snoozed,
    upcomingDeadlines,
    nextActions,
    recentActivity,
  };
}

function intParam(req: VercelRequest, name: string, fallback: number, max: number): number {
  const raw = queryParam(req, name);
  if (raw === undefined) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? Math.min(v, max) : fallback;
}

// GET /api/agent/digest?activityDays=7&horizonDays=14
// Everything a scheduled check-in needs, in one call: what needs attention
// and why, deadlines and next actions coming up, recent timeline activity,
// pipeline counts, and the stats strip numbers.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    throw new HttpError(405, "Method not allowed");
  }
  const ownerId = getOwnerId(req);
  const activityDays = intParam(req, "activityDays", 7, 90);
  const horizonDays = intParam(req, "horizonDays", 14, 90);
  const { db, close } = openDb();
  try {
    const apps = await loadAll(db, ownerId);
    res.status(200).json(buildDigest(apps, new Date(), activityDays, horizonDays));
  } finally {
    await close();
  }
});
