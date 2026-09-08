import { useCallback, useEffect, useReducer, useRef } from "react";
import { STATUS_LABELS, statusEventLabel, todayISO, type Application, type ApplicationEvent, type ApplicationInput, type ApplicationPatch, type BulkRequest, type Status } from "../../shared/types";
import { toISODate } from "../../shared/dates";
import { isCompletableStage, stageCompletedOn, withStageDone, withoutStageDone } from "../../shared/timeline";
import { api } from "../api";

export type Toast = { id: number; message: string; undo?: () => void };

export type State = {
  apps: Application[];
  /** Owner id the API is scoped to, from the list response. */
  owner?: string;
  loaded: boolean;
  loadError?: string;
  /** Inline, per-row errors from failed background writes. */
  errors: Record<string, string>;
  /** The single visible toast (latest wins). */
  toast?: Toast;
};

type Action =
  | { type: "loaded"; apps: Application[]; owner: string }
  | { type: "loadError"; message: string }
  | { type: "upsert"; app: Application }
  | { type: "upsertMany"; apps: Application[] }
  | { type: "remove"; id: string }
  | { type: "error"; id: string; message: string }
  | { type: "clearError"; id: string }
  | { type: "toast"; toast: Toast }
  | { type: "dismissToast"; id: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { ...state, apps: action.apps, owner: action.owner, loaded: true, loadError: undefined };
    case "loadError":
      return { ...state, loaded: true, loadError: action.message };
    case "upsert": {
      const i = state.apps.findIndex((a) => a.id === action.app.id);
      const apps = i === -1 ? [action.app, ...state.apps] : state.apps.map((a) => (a.id === action.app.id ? action.app : a));
      return { ...state, apps };
    }
    case "upsertMany": {
      const map = new Map(action.apps.map((a) => [a.id, a]));
      const apps = state.apps.map((a) => map.get(a.id) ?? a);
      for (const a of action.apps) if (!state.apps.some((x) => x.id === a.id)) apps.unshift(a);
      return { ...state, apps };
    }
    case "remove":
      return { ...state, apps: state.apps.filter((a) => a.id !== action.id) };
    case "error":
      return { ...state, errors: { ...state.errors, [action.id]: action.message } };
    case "clearError": {
      if (!(action.id in state.errors)) return state;
      const { [action.id]: _dropped, ...rest } = state.errors;
      void _dropped;
      return { ...state, errors: rest };
    }
    case "toast":
      return { ...state, toast: action.toast };
    case "dismissToast":
      return state.toast?.id === action.id ? { ...state, toast: undefined } : state;
  }
}

/** Apply a patch locally (null clears a field). */
export function applyPatch(app: Application, patch: ApplicationPatch): Application {
  const next: Application = { ...app, updatedAt: new Date().toISOString() };
  for (const [key, value] of Object.entries(patch) as [keyof ApplicationPatch, unknown][]) {
    if (value === null || value === undefined) delete next[key as keyof Application];
    else Object.assign(next, { [key]: value });
  }
  return next;
}

/** Build the patch for a status change: the event is appended automatically. */
export function statusPatch(app: Application, status: Status): ApplicationPatch {
  const today = todayISO();
  const patch: ApplicationPatch = {
    status,
    events: [...app.events, { date: today, label: statusEventLabel(status) }],
  };
  if (status === "applied" && !app.appliedDate) patch.appliedDate = today;
  // Back to Interested walks the apply itself back, so the row stops counting
  // as applied; Undo on the toast restores the date.
  if (status === "interested") patch.appliedDate = null;
  return patch;
}

const ERROR_TTL_MS = 6000;
const TOAST_TTL_MS = 6000;
/** A delete is only sent to the server once the undo window has passed. */
const DELETE_GRACE_MS = 6000;

export function useApplications() {
  const [state, dispatch] = useReducer(reducer, { apps: [], loaded: false, errors: {} });
  const timers = useRef(new Map<string, number>());
  const toastSeq = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const pendingDeletes = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelled = false;
    api
      .list()
      .then(({ apps, owner }) => {
        if (!cancelled) dispatch({ type: "loaded", apps, owner });
      })
      .catch((e: unknown) => {
        if (!cancelled) dispatch({ type: "loadError", message: e instanceof Error ? e.message : "Failed to load" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const flagError = useCallback((id: string, message: string) => {
    dispatch({ type: "error", id, message });
    const prev = timers.current.get(id);
    if (prev) window.clearTimeout(prev);
    timers.current.set(
      id,
      window.setTimeout(() => dispatch({ type: "clearError", id }), ERROR_TTL_MS),
    );
  }, []);

  const dismissToast = useCallback((id: number) => dispatch({ type: "dismissToast", id }), []);

  const showToast = useCallback(
    (message: string, undo?: () => void) => {
      const id = ++toastSeq.current;
      dispatch({ type: "toast", toast: { id, message, undo } });
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => dismissToast(id), TOAST_TTL_MS);
    },
    [dismissToast],
  );

  /** Optimistic partial update: apply now, PATCH in the background, roll back on failure. */
  const update = useCallback(
    (id: string, patch: ApplicationPatch) => {
      const prev = state.apps.find((a) => a.id === id);
      if (!prev) return;
      dispatch({ type: "clearError", id });
      dispatch({ type: "upsert", app: applyPatch(prev, patch) });
      api
        .patch(id, patch)
        .then((saved) => dispatch({ type: "upsert", app: saved }))
        .catch((e: unknown) => {
          dispatch({ type: "upsert", app: prev });
          flagError(id, e instanceof Error ? e.message : "Save failed");
        });
    },
    [state.apps, flagError],
  );

  const setStatus = useCallback(
    (id: string, status: Status) => {
      const app = state.apps.find((a) => a.id === id);
      if (!app || app.status === status) return;
      update(id, statusPatch(app, status));
      showToast(`${app.company} moved to ${STATUS_LABELS[status]}`, () =>
        update(id, { status: app.status, events: app.events, appliedDate: app.appliedDate ?? null }),
      );
    },
    [state.apps, update, showToast],
  );

  /** Mark the current stage (OA, phone screen, onsite) done, or undo that. */
  const setStageDone = useCallback(
    (id: string, done: boolean) => {
      const app = state.apps.find((a) => a.id === id);
      if (!app || !isCompletableStage(app)) return;
      if (done === (stageCompletedOn(app) !== undefined)) return;
      update(id, { events: done ? withStageDone(app) : withoutStageDone(app) });
      const stage = STATUS_LABELS[app.status];
      showToast(done ? `${app.company}: ${stage} marked complete` : `${app.company}: ${stage} no longer complete`, () =>
        update(id, { events: app.events }),
      );
    },
    [state.apps, update, showToast],
  );

  /** Optimistic delete with an undo window; the DELETE only goes out after it closes. */
  const remove = useCallback(
    (id: string) => {
      const prev = state.apps.find((a) => a.id === id);
      if (!prev) return;
      dispatch({ type: "remove", id });
      const timer = window.setTimeout(() => {
        pendingDeletes.current.delete(id);
        api.remove(id).catch((e: unknown) => {
          dispatch({ type: "upsert", app: prev });
          flagError(id, e instanceof Error ? e.message : "Delete failed");
        });
      }, DELETE_GRACE_MS);
      pendingDeletes.current.set(id, timer);
      showToast(`Deleted ${prev.company} — ${prev.role}`, () => {
        const t = pendingDeletes.current.get(id);
        if (t !== undefined) {
          window.clearTimeout(t);
          pendingDeletes.current.delete(id);
        }
        dispatch({ type: "upsert", app: prev });
      });
    },
    [state.apps, flagError, showToast],
  );

  /** Mute attention rules for N days (0 = unsnooze). */
  const snooze = useCallback(
    (id: string, days: number) => {
      if (days <= 0) {
        update(id, { snoozedUntil: null });
        return;
      }
      const until = new Date();
      until.setDate(until.getDate() + days);
      update(id, { snoozedUntil: toISODate(until) });
    },
    [update],
  );

  /** Append a manual timeline entry (interview notes, prep, a call). */
  const addEvent = useCallback(
    (id: string, event: ApplicationEvent) => {
      const app = state.apps.find((a) => a.id === id);
      if (!app) return;
      update(id, { events: [...app.events, event] });
    },
    [state.apps, update],
  );

  const create = useCallback(async (input: ApplicationInput): Promise<Application> => {
    const saved = await api.create(input);
    dispatch({ type: "upsert", app: saved });
    return saved;
  }, []);

  const bulk = useCallback(async (body: BulkRequest) => {
    const result = await api.bulk(body);
    dispatch({ type: "upsertMany", apps: [...result.created, ...result.updated] });
    return result;
  }, []);

  // Flush pending deletes if the page is closed inside the undo window.
  useEffect(() => {
    const flush = () => {
      for (const [id, t] of pendingDeletes.current) {
        window.clearTimeout(t);
        void api.remove(id, true);
      }
      pendingDeletes.current.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  return { state, update, setStatus, setStageDone, remove, snooze, addEvent, create, bulk, dismissToast };
}

export type Store = ReturnType<typeof useApplications>;
