import {
  COMPLETABLE_STAGES,
  stageDoneEventLabel,
  stageFromDoneEventLabel,
  statusFromEventLabel,
  todayISO,
  type Application,
  type ApplicationEvent,
} from "./types.js";

/** Events oldest first; same-day entries keep the order they were appended in. */
export function chronological(events: readonly ApplicationEvent[]): ApplicationEvent[] {
  return events
    .map((event, i) => ({ event, i }))
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || a.i - b.i)
    .map((x) => x.event);
}

/** Index of the last move into the app's current status, or -1 if the timeline
 *  never records one (an imported row, say). */
function enteredCurrentStage(events: readonly ApplicationEvent[], app: Application): number {
  let entered = -1;
  events.forEach((e, i) => {
    if (statusFromEventLabel(e.label) === app.status) entered = i;
  });
  return entered;
}

/** True when the stage the app sits in is one you can finish (OA, interviews). */
export function isCompletableStage(app: Application): boolean {
  return COMPLETABLE_STAGES.includes(app.status);
}

/**
 * Date the current stage was marked complete, or undefined. Only markers
 * logged after the most recent move into the stage count, so coming back to a
 * stage (a second onsite round) starts it over.
 */
export function stageCompletedOn(app: Application): string | undefined {
  if (!isCompletableStage(app)) return undefined;
  const events = chronological(app.events);
  const entered = enteredCurrentStage(events, app);
  for (let i = events.length - 1; i > entered; i--) {
    const e = events[i];
    if (e && stageFromDoneEventLabel(e.label) === app.status) return e.date;
  }
  return undefined;
}

/** Events plus a completion marker for the current stage. */
export function withStageDone(app: Application, date: string = todayISO()): ApplicationEvent[] {
  return [...app.events, { date, label: stageDoneEventLabel(app.status) }];
}

/** Events without the current stage's completion marker(s); earlier stages keep theirs. */
export function withoutStageDone(app: Application): ApplicationEvent[] {
  const events = chronological(app.events);
  const entered = enteredCurrentStage(events, app);
  const drop = new Set(events.filter((e, i) => i > entered && stageFromDoneEventLabel(e.label) === app.status));
  return app.events.filter((e) => !drop.has(e));
}
