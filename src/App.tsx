import { useCallback, useEffect, useMemo, useState } from "react";
import type { Status } from "../shared/types";
import { getToken, UNAUTHORIZED_EVENT } from "./auth";
import { Board } from "./components/Board";
import { Drawer } from "./components/Drawer";
import { FilterBar } from "./components/FilterBar";
import { PasswordGate } from "./components/PasswordGate";
import { Header } from "./components/Header";
import { StatsStrip } from "./components/StatsStrip";
import { SyncModal } from "./components/SyncModal";
import { TableView } from "./components/TableView";
import { needsAttention } from "./lib/attention";
import { allTags, applyFilters, EMPTY_FILTERS, type Filters } from "./lib/filters";
import { contextForClaude } from "./lib/import";
import { loadView, saveView, type ViewMode } from "./lib/prefs";
import { computeStats } from "./lib/stats";
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
  const { apps, loaded, loadError, errors } = store.state;

  const [view, setView] = useState<ViewMode>(loadView);
  useEffect(() => saveView(view), [view]);
  const narrow = useMediaQuery("(max-width: 767px)");
  const effectiveView: ViewMode = narrow ? "table" : view;

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  // One clock per render pass; re-tick every minute so "today" rolls over.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const attentionCount = useMemo(() => apps.filter((a) => needsAttention(a, now)).length, [apps, now]);
  const filtered = useMemo(() => applyFilters(apps, filters, now), [apps, filters, now]);
  const stats = useMemo(() => computeStats(apps), [apps]);
  const tags = useMemo(() => allTags(apps), [apps]);
  const selected = selectedId ? (apps.find((a) => a.id === selectedId) ?? null) : null;

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setCreating(false);
  }, []);
  const closeSync = useCallback(() => setSyncOpen(false), []);
  const onMove = useCallback((id: string, status: Status) => store.setStatus(id, status), [store]);

  return (
    <>
      <Header
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
        contextJson={() => contextForClaude(apps)}
      />
      <StatsStrip stats={stats} shown={filtered.length} total={apps.length} />
      <FilterBar filters={filters} onChange={setFilters} tags={tags} />

      <main className="flex-1 min-h-0 flex flex-col">
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
          <div className="p-6 text-center text-muted text-[12px]">
            No applications yet. Add one with New, or paste Claude&apos;s JSON into Sync.
          </div>
        )}
        {loaded && !loadError && apps.length > 0 && effectiveView === "board" && (
          <Board apps={filtered} errors={errors} now={now} onOpen={setSelectedId} onMove={onMove} />
        )}
        {loaded && !loadError && apps.length > 0 && effectiveView === "table" && (
          <TableView apps={filtered} errors={errors} now={now} onOpen={setSelectedId} onStatus={onMove} />
        )}
      </main>

      {(selected || creating) && <Drawer app={creating ? null : selected} store={store} now={now} onClose={closeDrawer} />}
      {syncOpen && <SyncModal apps={apps} store={store} onClose={closeSync} />}
    </>
  );
}
