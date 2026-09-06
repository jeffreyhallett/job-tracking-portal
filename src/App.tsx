import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STATUSES, type Status } from "../shared/types";
import { computeStats, weeklyFunnel } from "../shared/stats";
import { needsAttention } from "../shared/attention";
import { contextForClaude } from "../shared/import";
import { getToken, UNAUTHORIZED_EVENT } from "./auth";
import { Board } from "./components/Board";
import { Icon } from "./components/Icon";
import { Drawer } from "./components/Drawer";
import { FilterBar } from "./components/FilterBar";
import { Header } from "./components/Header";
import { PasswordGate } from "./components/PasswordGate";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { StatsStrip } from "./components/StatsStrip";
import { SyncModal } from "./components/SyncModal";
import { TableView } from "./components/TableView";
import { Toast } from "./components/Toast";
import { allTags, applyFilters, EMPTY_FILTERS, type Filters } from "./lib/filters";
import { loadSort, loadView, saveSort, saveView, type ViewMode } from "./lib/prefs";
import { useShortcuts, type ShortcutHandlers } from "./lib/shortcuts";
import { boardOrder, sortApps, type Sort } from "./lib/sort";
import { useMediaQuery } from "./lib/useMediaQuery";
import { useApplications } from "./state/store";

export default function App() {
  const [authed, setAuthed] = useState(() => getToken() !== null);
  useEffect(() => {
    const onUnauthorized = () => setAuthed(false);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);
  if (!authed) return <PasswordGate onAuthed={() => setAuthed(true)} />;
  return <Tracker />;
}

function Tracker() {
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
  const searchRef = useRef<HTMLInputElement>(null);

  // One clock per render pass; re-tick every minute so "today" rolls over.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const attentionCount = useMemo(() => apps.filter((a) => needsAttention(a, now)).length, [apps, now]);
  const filtered = useMemo(() => applyFilters(apps, filters, now), [apps, filters, now]);
  const ordered = useMemo(() => (effectiveView === "board" ? boardOrder(filtered) : sortApps(filtered, sort)), [filtered, effectiveView, sort]);
  const stats = useMemo(() => computeStats(apps), [apps]);
  const weeks = useMemo(() => weeklyFunnel(apps, 8, now), [apps, now]);
  const tags = useMemo(() => allTags(apps), [apps]);
  const selected = selectedId ? (apps.find((a) => a.id === selectedId) ?? null) : null;

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setCreating(false);
  }, []);
  const closeSync = useCallback(() => setSyncOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
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
        if (syncOpen) setSyncOpen(false);
        else if (helpOpen) setHelpOpen(false);
        else if (selectedId || creating) closeDrawer();
        else setFocusedId(null);
      },
      setStatusIndex: (i) => {
        const id = target();
        const status = STATUSES[i];
        if (id && status) store.setStatus(id, status);
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
  }, [ordered, focusedId, selectedId, creating, syncOpen, helpOpen, narrow, open, closeDrawer, store]);
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
        contextJson={() => contextForClaude(apps)}
      />
      <StatsStrip stats={stats} weeks={weeks} shown={filtered.length} total={apps.length} />
      <FilterBar filters={filters} onChange={setFilters} tags={tags} searchRef={searchRef} />

      <main className={`flex-1 min-h-0 flex flex-col ${narrow ? "pb-24" : ""}`}>
        {!loaded && <div className="p-4 text-muted text-[12px]">Loading…</div>}
        {loaded && loadError && (
          <div className="p-4 text-[12px]">
            <div className="text-danger">Could not load applications: {loadError}</div>
            <div className="text-muted mt-1">
              Is the API running? Locally that means <code className="kbd">vercel dev</code> alongside <code className="kbd">npm run dev</code>, with DATABASE_URL and APP_PASSWORD set.
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
              Reading as owner <code className="kbd">{owner ?? "unknown"}</code>. If you seeded under a different owner, set DEFAULT_OWNER_ID for this environment.
            </div>
          </div>
        )}
        {loaded && !loadError && apps.length > 0 && effectiveView === "board" && (
          <Board apps={filtered} errors={errors} now={now} focusedId={focusedId} onOpen={open} onMove={onMove} />
        )}
        {loaded && !loadError && apps.length > 0 && effectiveView === "table" && (
          <TableView apps={filtered} errors={errors} now={now} sort={sort} onSort={setSort} focusedId={focusedId} onOpen={open} onStatus={onMove} />
        )}
      </main>

      {narrow && !(selected || creating) && !syncOpen && !helpOpen && (
        <nav className="dock" aria-label="Quick actions">
          <button type="button" className="dock-item" aria-pressed={filters.attention} onClick={() => setFilters((f) => ({ ...f, attention: !f.attention }))}>
            <span className="relative">
              <Icon name="clock" size={22} strokeWidth={1.9} />
              {attentionCount > 0 && (
                <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-warn text-white text-[10px] font-semibold inline-flex items-center justify-center tabular-nums">{attentionCount}</span>
              )}
            </span>
            Attention
          </button>
          <button type="button" className="dock-item" onClick={() => searchRef.current?.focus()}>
            <Icon name="search" size={22} strokeWidth={1.9} />
            Search
          </button>
          <button
            type="button"
            className="dock-primary"
            aria-label="New application"
            onClick={() => {
              setSelectedId(null);
              setCreating(true);
            }}
          >
            <Icon name="plus" size={26} strokeWidth={2.4} />
          </button>
          <button type="button" className="dock-item" onClick={() => setSyncOpen(true)}>
            <Icon name="sync" size={22} strokeWidth={1.9} />
            Sync
          </button>
          <button type="button" className="dock-item" onClick={() => setHelpOpen(true)}>
            <Icon name="keyboard" size={22} strokeWidth={1.9} />
            Keys
          </button>
        </nav>
      )}
      {(selected || creating) && <Drawer app={creating ? null : selected} store={store} now={now} onClose={closeDrawer} />}
      {syncOpen && <SyncModal apps={apps} store={store} onClose={closeSync} />}
      {helpOpen && <ShortcutsHelp onClose={closeHelp} />}
      <Toast toast={toast} onDismiss={store.dismissToast} />
    </>
  );
}
