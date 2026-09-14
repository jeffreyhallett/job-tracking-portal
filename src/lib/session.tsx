import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  resolveColumns,
  resolveLanes,
  resolveStatusLabels,
  resolveStatusOrder,
  visibleColumns as onlyVisibleColumns,
  visibleLanes as onlyVisibleLanes,
  type Column,
  type Lane,
  type UserPrefs,
} from "../../shared/prefs";
import type { Status } from "../../shared/types";
import type { PublicUser } from "../../shared/user";
import { api } from "../api";

/**
 * Who is signed in, and everything derived from their preferences.
 *
 * The lane labels live here rather than being threaded through a dozen
 * components: renaming "Phone screen" has to change the board header, the table
 * select, the filter chips, the drawer and the toasts at once.
 */
export type Session = {
  user: PublicUser;
  /** Every lane in the user's order, hidden ones included (Settings needs them). */
  lanes: Lane[];
  visibleLanes: Lane[];
  /** What this user calls each status. Always covers every Status. */
  labels: Record<Status, string>;
  /** Sort weight per status, following the user's lane order. */
  statusOrder: Record<Status, number>;
  columns: Column[];
  visibleColumns: Column[];
  /** Apply prefs locally at once, then persist. Reverts if the write fails. */
  savePrefs: (prefs: UserPrefs) => Promise<void>;
  setUser: (user: PublicUser) => void;
  signOut: () => void;
};

const SessionContext = createContext<Session | null>(null);

type ProviderProps = {
  user: PublicUser;
  onUser: (user: PublicUser) => void;
  onSignOut: () => void;
  children: ReactNode;
};

export function SessionProvider({ user, onUser, onSignOut, children }: ProviderProps) {
  const savePrefs = useCallback(
    async (prefs: UserPrefs) => {
      const previous = user;
      onUser({ ...user, prefs });
      try {
        onUser(await api.updateMe({ prefs }));
      } catch (e) {
        onUser(previous);
        throw e;
      }
    },
    [user, onUser],
  );

  const value = useMemo<Session>(() => {
    const lanes = resolveLanes(user.prefs);
    const columns = resolveColumns(user.prefs);
    return {
      user,
      lanes,
      visibleLanes: onlyVisibleLanes(lanes),
      labels: resolveStatusLabels(user.prefs),
      statusOrder: resolveStatusOrder(user.prefs),
      columns,
      visibleColumns: onlyVisibleColumns(columns),
      savePrefs,
      setUser: onUser,
      signOut: onSignOut,
    };
  }, [user, savePrefs, onUser, onSignOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession used outside SessionProvider");
  return session;
}

/** The common case: just the lane names. */
export function useStatusLabels(): Record<Status, string> {
  return useSession().labels;
}
