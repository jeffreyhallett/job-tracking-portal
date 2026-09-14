import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { resolveColumns, resolveUserStages, visibleColumns as onlyVisibleColumns, type Column, type UserPrefs } from "../../shared/prefs";
import type { StageSet } from "../../shared/stages";
import type { PublicUser } from "../../shared/user";
import { api } from "../api";

/** Moving a deleted stage's applications somewhere that still exists. */
export type StageReassignment = { from: string; to: string };

/**
 * Who is signed in, and their pipeline.
 *
 * The StageSet lives here rather than being threaded through a dozen
 * components: adding a stage, renaming one, or changing what one means has to
 * change the board, the table, the filter chips, the drawer, the sort order and
 * the toasts at once.
 */
export type Session = {
  user: PublicUser;
  stages: StageSet;
  columns: Column[];
  visibleColumns: Column[];
  /**
   * Apply preferences locally at once, then persist. Reverts if the write
   * fails. `reassign` moves the applications of stages being removed, in the
   * same transaction as the new pipeline.
   */
  savePrefs: (prefs: UserPrefs, reassign?: StageReassignment[]) => Promise<void>;
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
    async (prefs: UserPrefs, reassign?: StageReassignment[]) => {
      const previous = user;
      onUser({ ...user, prefs });
      try {
        onUser(await api.updateMe({ prefs, ...(reassign?.length ? { reassignStages: reassign } : {}) }));
      } catch (e) {
        onUser(previous);
        throw e;
      }
    },
    [user, onUser],
  );

  const value = useMemo<Session>(() => {
    const columns = resolveColumns(user.prefs);
    return {
      user,
      stages: resolveUserStages(user.prefs),
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

/** The common case: just the pipeline. */
export function useStages(): StageSet {
  return useSession().stages;
}
