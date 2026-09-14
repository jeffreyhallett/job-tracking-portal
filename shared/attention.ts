import { daysBetween, daysSince, parseDate } from "./dates.js";
import type { StageSet } from "./stages.js";
import type { Application } from "./types.js";

export type AttentionReason =
  | { kind: "stale"; days: number }
  | { kind: "action_due"; days: number } // days overdue (0 = today)
  | { kind: "deadline_soon"; days: number }; // days until deadline

export const STALE_AFTER_DAYS = 14;
export const DEADLINE_WINDOW_DAYS = 7;

/**
 * An application needs attention when any of these hold:
 *  - it is in a stage where the company owes you a move, and has not been
 *    touched in more than 14 days
 *  - nextActionDate is today or past
 *  - nothing has been sent yet and the deadline is within 7 days
 *
 * Which stages those are is the user's pipeline talking, not a constant: see
 * `phase` in stages.ts.
 */

/** True while the app's attention rules are muted. */
export function isSnoozed(app: Application, now: Date = new Date()): boolean {
  const until = parseDate(app.snoozedUntil);
  return until !== undefined && daysBetween(now, until) > 0;
}

/** Reasons regardless of snooze; the UI shows these greyed out while snoozed. */
export function rawAttentionReasons(app: Application, stages: StageSet, now: Date = new Date()): AttentionReason[] {
  const reasons: AttentionReason[] = [];

  if (stages.isInFlight(app.status)) {
    const days = daysSince(app.updatedAt, now);
    if (days > STALE_AFTER_DAYS) reasons.push({ kind: "stale", days });
  }

  const next = parseDate(app.nextActionDate);
  if (next) {
    const overdue = daysBetween(next, now);
    if (overdue >= 0) reasons.push({ kind: "action_due", days: overdue });
  }

  const deadline = parseDate(app.deadline);
  if (deadline && stages.isLead(app.status)) {
    const until = daysBetween(now, deadline);
    if (until <= DEADLINE_WINDOW_DAYS) reasons.push({ kind: "deadline_soon", days: until });
  }

  return reasons;
}

/** Reasons that count: empty while snoozed. */
export function attentionReasons(app: Application, stages: StageSet, now: Date = new Date()): AttentionReason[] {
  return isSnoozed(app, now) ? [] : rawAttentionReasons(app, stages, now);
}

export function needsAttention(app: Application, stages: StageSet, now: Date = new Date()): boolean {
  return attentionReasons(app, stages, now).length > 0;
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
