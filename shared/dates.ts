const DAY_MS = 86_400_000;

/** Parse "YYYY-MM-DD" (or an ISO timestamp) into a local-midnight Date. */
export function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : new Date(t);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** Days since a timestamp, fractional days floored. */
export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
}

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const fullDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

export function formatDate(value: string | undefined, withYear = false): string {
  const d = parseDate(value);
  if (!d) return "";
  return (withYear ? fullDate : shortDate).format(d);
}

/** "today", "3d ago", "in 2d", "12d ago"... */
export function formatRelativeDays(value: string | undefined, now: Date = new Date()): string {
  const d = parseDate(value);
  if (!d) return "";
  const diff = daysBetween(now, d);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff}d` : `${-diff}d ago`;
}
