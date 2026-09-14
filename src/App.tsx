import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { needsAttention } from "../shared/attention";
import { contextForClaude } from "../shared/import";
import { computeStats, weeklyFunnel } from "../shared/stats";
import { stageCompletedOn } from "../shared/timeline";
import type { Status } from "../shared/types";
import type { PublicUser } from "../shared/user";
import { api } from "./api";
import { getToken, signOut as forgetDevice, UNAUTHORIZED_EVENT } from "./auth";
import { Board } from "./components/Board";
import { Drawer } from "./components/Drawer";
import { FilterBar } from "./components/FilterBar";
import { Header } from "./components/Header";
import { Icon } from "./components/Icon";
import { Settings } from "./components/Settings";
import { SetPassword, SignIn } from "./components/SignIn";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { StatsStrip } from "./components/StatsStrip";
import { SyncModal } from "./components/SyncModal";
import { TableView } from "./components/TableView";
import { Toast } from "./components/Toast";
import { allTags, applyFilters, EMPTY_FILTERS, type Filters } from "./lib/filters";
import { loadSort, loadView, saveSort, saveView, type ViewMode } from "./lib/prefs";
import { SessionProvider, useSession } from "./lib/session";
import { useShortcuts, type ShortcutHandlers } from "./lib/shortcuts";
import { boardOrder, sortApps, type Sort } from "./lib/sort";
import { useMediaQuery } from "./lib/useMediaQuery";
import { useApplications } from "./state/store";

/**
 * A stored token says which device is signed in but not who; GET /api/me
 * resolves that on boot, and is also how a revoked or expired token is noticed
 * before the UI renders.
 */
type Boot = { phase: "checking" } | { phase: "anon" } | { phase: "signed"; user: PublicUser };

export default function App() {
  const [boot, setBoot] = useState<Boot>(() => (getToken() ? { phase: "checking" } : { phase: "anon" }));

  useEffect(() => {
    if (boot.phase !== "checking") return;
    let cancelled = false;
    api
      .me()
      .then((user) => {
        if (!cancelled) setBoot({ phase: "signed", user });
      })
      .catch(() => {
        // A 401 already cleared the token through the api client.
        if (!cancelled) setBoot({ phase: "anon" });
      });
    return () => {
      cancelled = true;
    };
  }, [boot.phase]);

  useEffect(() => {
    const onUnauthorized = () => setBoot({ phase: "anon" });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const setUser = useCallback((user: PublicUser) => setBoot({ phase: "signed", user }), []);
  const signOut = useCallback(() => forgetDevice(), []);

  if (boot.phase === "checking") return <div className="flex-1 flex items-center justify-center text-muted text-[12px]">Loading…</div>;
  if (boot.phase === "anon") return <SignIn onSignedIn={setUser} />;
  if (boot.user.mustChangePassword) return <SetPassword user={boot.user} onDone={setUser} />;

  return (
    <SessionProvider user={boot.user} onUser={setUser} onSignOut={signOut}>
      <Tracker />
    </SessionProvider>
  );
}

function Tracker() {
  const { user, stages } = useSession();
  const store = useApplications();
  const { apps, owner, loaded, loadError, errors, toast } = store.state;

  const [view, setView] = useState<ViewMode>(loadView);
  useEffect(() => saveView(view), [view]);
  const [sort, setSort] = useState<Sort>(loadSort);
  useEffect(() => saveSort(sort), [sort]);
  const narrow = useMediaQuery("(max-width: 767px)");
  const effectiveView: ViewMode = narrow ? "table" : view;

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // One clock per render pass; re-tick every minute so "today" rolls over.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const attentionCount = useMemo(() => apps.filter((a) => needsAttention(a, stages, now)).length, [apps, stages, now]);
  const filtered = useMemo(() => applyFilters(apps, filters, stages, now), [apps, filters, stages, now]);
  const ordered = useMemo(
    () => (effectiveView === "board" ? boardOrder(filtered, stages) : sortApps(filtered, sort, stages)),
    [filtered, effectiveView, sort, stages],
  );
  const stats = useMemo(() => computeStats(apps, stages), [apps, stages]);
  const weeks = useMemo(() => weeklyFunnel(apps, stages, 8, now), [apps, stages, now]);
  const tags = useMemo(() => allTags(apps), [apps]);
  const selected = selectedId ? (apps.find((a) => a.id === selectedId) ?? null) : null;

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setCreating(false);
  }, []);
  const closeSync = useCallback(() => setSyncOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const onMove = useCallback((id: string, status: Status) => store.setStatus(id, status), [store]);
  const open = useCallback((id: string) => {
    setFocusedId(id);
    setSelectedId(id);
    setCreating(false);
  }, []);

  const shortcuts = useMemo<ShortcutHandlers>(() => {
    const step = (delta: number) => {
      if (ordered.length === 0) return;
      const i = focusedId ? ordered.findIndex((a) => a.id === focusedId) : -1;
      const next = ordered[Math.min(ordered.length - 1, Math.max(0, i + delta))] ?? ordered[0];
      if (next) {
        setFocusedId(next.id);
        if (selectedId) setSelectedId(next.id);
      }
    };
    const target = () => selectedId ?? focusedId;
    return {
      newApplication: () => {
        setSelectedId(null);
        setCreating(true);
      },
      focusSearch: () => searchRef.current?.focus(),
      next: () => step(1),
      prev: () => step(-1),
      open: () => {
        const id = target();
        if (id) open(id);
      },
      close: () => {
        if (settingsOpen) setSettingsOpen(false);
        else if (syncOpen) setSyncOpen(false);
        else if (helpOpen) setHelpOpen(false);
        else if (selectedId || creating) closeDrawer();
        else setFocusedId(null);
      },
      // 1..9 follow the stages the user sees, in their order.
      setStatusIndex: (i) => {
        const id = target();
        const status = stages.visible[i]?.id;
        if (id && status) store.setStatus(id, status);
      },
      toggleStageDone: () => {
        const id = target();
        const app = id ? apps.find((a) => a.id === id) : undefined;
        if (app) store.setStageDone(app.id, stageCompletedOn(app, stages) === undefined);
      },
      snooze: () => {
        const id = target();
        if (id) store.snooze(id, 7);
      },
      toggleView: () => {
        if (!narrow) setView((v) => (v === "board" ? "table" : "board"));
      },
      help: () => setHelpOpen((h) => !h),
    };
  }, [apps, ordered, focusedId, selectedId, creating, syncOpen, helpOpen, settingsOpen, narrow, open, closeDrawer, store, stages]);
  useShortcuts(shortcuts);

  return (
    <>
      <Header
        total={apps.length}
        active={stats.active}
        attentionCount={attentionCount}
        attentionOn={filters.attention}
        onToggleAttention={() => setFilters((f) => ({ ...f, attention: !f.attention }))}
        view={effectiveView}
        onView={setView}
        viewLocked={narrow}
        onNew={() => {
          setSelectedId(null);
          setCreating(true);
        }}
        onSync={() => setSyncOpen(true)}
        onHelp={() => setHelpOpen(true)}
        onSettings={openSettings}
        contextJson={() => contextForClaude(apps)}
      />
      <StatsStrip stats={stats} weeks={weeks} shown={filtered.length} total={apps.length} />
      <FilterBar filters={filters} onChange={setFilters} tags={tags} searchRef={searchRef} />

      <main className="flex-1 min-h-0 flex flex-col">
        {!loaded && <div className="p-4 text-muted text-[12px]">Loading…</div>}
        {loaded && loadError && (
          <div className="p-4 text-[12px]">
            <div className="text-danger">Could not load applications: {loadError}</div>
            <div className="text-muted mt-1">
              Is the API running? Locally that means <code className="kbd">vercel dev</code> alongside <code className="kbd">npm run dev</code>, with DATABASE_URL set.
            </div>
          </div>
        )}
        {loaded && !loadError && apps.length === 0 && (
          <div className="mx-4 sm:mx-6 mb-4 tile p-8 text-center text-[13px] text-fg-2 flex flex-col items-center gap-2">
            <span className="w-11 h-11 rounded-[13px] bg-accent-container text-on-accent-container inline-flex items-center justify-center">
              <Icon name="briefcase" size={22} />
            </span>
            <div className="font-medium text-fg">No applications yet</div>
            <div>Add one with New, or paste Claude&apos;s JSON into Sync.</div>
            <div className="text-[12px] text-muted">
              Signed in as <code className="kbd">{owner ?? user.email}</code>. Each account sees only its own applications.
            </div>
          </div>
        )}
        {loaded && !loadError && apps.length > 0 && effectiveView === "board" && (
          <Board apps={filtered} errors={errors} now={now} focusedId={focusedId} onOpen={open} onMove={onMove} onEditStages={openSettings} />
        )}
        {loaded && !loadError && apps.length > 0 && effectiveView === "table" && (
          <TableView apps={filtered} errors={errors} now={now} sort={sort} onSort={setSort} focusedId={focusedId} onOpen={open} onStatus={onMove} />
        )}
      </main>

      {narrow && !(selected || creating) && !syncOpen && !settingsOpen && (
        <button
          type="button"
          className="fab"
          aria-label="New application"
          onClick={() => {
            setSelectedId(null);
            setCreating(true);
          }}
        >
          <Icon name="plus" size={26} strokeWidth={2.2} />
        </button>
      )}
      {(selected || creating) && <Drawer app={creating ? null : selected} store={store} now={now} onClose={closeDrawer} />}
      {syncOpen && <SyncModal apps={apps} store={store} onClose={closeSync} />}
      {settingsOpen && <Settings apps={apps} onReload={() => void store.reload()} onClose={closeSettings} />}
      {helpOpen && <ShortcutsHelp onClose={closeHelp} />}
      <Toast toast={toast} onDismiss={store.dismissToast} />
    </>
  );
}
