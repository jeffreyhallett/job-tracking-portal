import type { StageSet } from "./stages.js";
import { stageDoneEvent, stageFromDoneEvent, statusEvent, statusFromEvent, todayISO, type Application, type ApplicationEvent } from "./types.js";

/** Events oldest first; same-day entries keep the order they were appended in. */
export function chronological(events: readonly ApplicationEvent[]): ApplicationEvent[] {
  return events
    .map((event, i) => ({ event, i }))
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || a.i - b.i)
    .map((x) => x.event);
}

/** Index of the last move into the app's current status, or -1 if the timeline
 *  never records one (an imported row, say). */
function enteredCurrentStage(events: readonly ApplicationEvent[], app: Application, stages: StageSet): number {
  let entered = -1;
  events.forEach((e, i) => {
    if (statusFromEvent(e, stages) === app.status) entered = i;
  });
  return entered;
}

/** True when the stage the app sits in is one you can sit and finish. */
export function isCompletableStage(app: Application, stages: StageSet): boolean {
  return stages.isCompletable(app.status);
}

/**
 * Date the current stage was marked complete, or undefined. Only markers
 * logged after the most recent move into the stage count, so coming back to a
 * stage (a second onsite round) starts it over.
 */
export function stageCompletedOn(app: Application, stages: StageSet): string | undefined {
  if (!isCompletableStage(app, stages)) return undefined;
  const events = chronological(app.events);
  const entered = enteredCurrentStage(events, app, stages);
  for (let i = events.length - 1; i > entered; i--) {
    const e = events[i];
    if (e && stageFromDoneEvent(e, stages) === app.status) return e.date;
  }
  return undefined;
}

/** Events plus a completion marker for the current stage. */
export function withStageDone(app: Application, stages: StageSet, date: string = todayISO()): ApplicationEvent[] {
  return [...app.events, stageDoneEvent(app.status, date, stages)];
}

/** Events without the current stage's completion marker(s); earlier stages keep theirs. */
export function withoutStageDone(app: Application, stages: StageSet): ApplicationEvent[] {
  const events = chronological(app.events);
  const entered = enteredCurrentStage(events, app, stages);
  const drop = new Set(events.filter((e, i) => i > entered && stageFromDoneEvent(e, stages) === app.status));
  return app.events.filter((e) => !drop.has(e));
}

/**
 * Point every timeline entry about stage `from` at stage `to` instead.
 *
 * Used when a stage is deleted: its applications move, and their history moves
 * with them, so nothing is left referring to a stage that no longer exists —
 * which would otherwise make the stats replay treat that history as unreadable.
 *
 * `before` resolves entries as they were written (including the ones from before
 * events carried stage ids, which are recognised by their label and upgraded
 * here); `after` supplies the labels to write.
 */
export function retargetEvents(events: readonly ApplicationEvent[], from: string, to: string, before: StageSet, after: StageSet): ApplicationEvent[] {
  return events.map((event) => {
    const keepDetails = event.details === undefined ? {} : { details: event.details };
    if (statusFromEvent(event, before) === from) return { ...statusEvent(to, event.date, after), ...keepDetails };
    if (stageFromDoneEvent(event, before) === from) return { ...stageDoneEvent(to, event.date, after), ...keepDetails };
    return event;
  });
}
