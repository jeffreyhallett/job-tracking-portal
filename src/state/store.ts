import { useCallback, useEffect, useReducer, useRef } from "react";
import { statusEventLabel, todayISO, type Application, type ApplicationInput, type ApplicationPatch, type BulkRequest, type Status } from "../../shared/types";
import { api } from "../api";

export type State = {
  apps: Application[];
  /** Owner id the API is scoped to, from the list response. */
  owner?: string;
  loaded: boolean;
  loadError?: string;
  /** Inline, per-row errors from failed background writes. */
  errors: Record<string, string>;
};

type Action =
  | { type: "loaded"; apps: Application[]; owner: string }
  | { type: "loadError"; message: string }
  | { type: "upsert"; app: Application }
  | { type: "upsertMany"; apps: Application[] }
  | { type: "remove"; id: string }
  | { type: "error"; id: string; message: string }
  | { type: "clearError"; id: string };

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
  return patch;
}

const ERROR_TTL_MS = 6000;

export function useApplications() {
  const [state, dispatch] = useReducer(reducer, { apps: [], loaded: false, errors: {} });
  const timers = useRef(new Map<string, number>());

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
    },
    [state.apps, update],
  );

  const remove = useCallback(
    (id: string) => {
      const prev = state.apps.find((a) => a.id === id);
      if (!prev) return;
      dispatch({ type: "remove", id });
      api.remove(id).catch((e: unknown) => {
        dispatch({ type: "upsert", app: prev });
        flagError(id, e instanceof Error ? e.message : "Delete failed");
      });
    },
    [state.apps, flagError],
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

  return { state, update, setStatus, remove, create, bulk };
}

export type Store = ReturnType<typeof useApplications>;
