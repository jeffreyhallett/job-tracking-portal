import { IN_FLIGHT_STAGES, type Application } from "../../shared/types";
import { daysBetween, daysSince, parseDate } from "./dates";

export type AttentionReason =
  | { kind: "stale"; days: number }
  | { kind: "action_due"; days: number } // days overdue (0 = today)
  | { kind: "deadline_soon"; days: number }; // days until deadline

export const STALE_AFTER_DAYS = 14;
export const DEADLINE_WINDOW_DAYS = 7;

/**
 * An application needs attention when any of these hold:
 *  - in flight (applied / oa / phone_screen / onsite) and untouched > 14 days
 *  - nextActionDate is today or past
 *  - status still `interested` and the deadline is within 7 days
 */
export function attentionReasons(app: Application, now: Date = new Date()): AttentionReason[] {
  const reasons: AttentionReason[] = [];

  if (IN_FLIGHT_STAGES.includes(app.status)) {
    const days = daysSince(app.updatedAt, now);
    if (days > STALE_AFTER_DAYS) reasons.push({ kind: "stale", days });
  }

  const next = parseDate(app.nextActionDate);
  if (next) {
    const overdue = daysBetween(next, now);
    if (overdue >= 0) reasons.push({ kind: "action_due", days: overdue });
  }

  const deadline = parseDate(app.deadline);
  if (deadline && app.status === "interested") {
    const until = daysBetween(now, deadline);
    if (until <= DEADLINE_WINDOW_DAYS) reasons.push({ kind: "deadline_soon", days: until });
  }

  return reasons;
}

export function needsAttention(app: Application, now: Date = new Date()): boolean {
  return attentionReasons(app, now).length > 0;
}

export function describeReason(r: AttentionReason): string {
  switch (r.kind) {
    case "stale":
      return `no movement in ${r.days}d`;
    case "action_due":
      return r.days === 0 ? "action due today" : `action ${r.days}d overdue`;
    case "deadline_soon":
      if (r.days < 0) return `deadline passed ${-r.days}d ago`;
      return r.days === 0 ? "deadline today" : `deadline in ${r.days}d`;
  }
}
