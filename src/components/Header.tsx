import type { ViewMode } from "../lib/prefs";
import { CopyButton } from "./ui";

type Props = {
  attentionCount: number;
  attentionOn: boolean;
  onToggleAttention: () => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  viewLocked: boolean;
  onNew: () => void;
  onSync: () => void;
  onHelp: () => void;
  contextJson: () => string;
};

export function Header(p: Props) {
  return (
    <header
      className="flex items-center gap-2 h-12 px-3 sm:px-4 sticky top-0 z-20 border-b border-line"
      style={{ background: "color-mix(in srgb, var(--c-panel) 78%, transparent)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)" }}
    >
      <h1 className="font-semibold text-[15px] tracking-[-0.02em] mr-1">Applications</h1>

      <button
        type="button"
        onClick={p.onToggleAttention}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-medium select-none transition-colors"
        style={{
          background: p.attentionOn ? "color-mix(in srgb, var(--c-warn) 16%, transparent)" : "var(--c-hover)",
          color: p.attentionCount ? "var(--c-warn)" : "var(--c-muted)",
        }}
        title="Show only applications that need attention"
        aria-pressed={p.attentionOn}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        <span className="tabular-nums">{p.attentionCount}</span>
        <span className="hidden sm:inline">need attention</span>
      </button>

      <div className="flex-1" />

      {!p.viewLocked && (
        <div className="seg" role="tablist" aria-label="View">
          {(["board", "table"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={p.view === v} onClick={() => p.onView(v)} className="seg-item capitalize">
              {v}
            </button>
          ))}
        </div>
      )}

      <button type="button" className="btn btn-ghost h-8 w-8 px-0 rounded-full text-muted hidden sm:inline-flex" onClick={p.onHelp} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
        ?
      </button>
      <CopyButton text={p.contextJson} label="Copy context" className="hidden sm:inline-flex" />
      <button type="button" className="btn" onClick={p.onSync}>
        Sync
      </button>
      <button type="button" className="btn btn-primary" onClick={p.onNew}>
        New
      </button>
    </header>
  );
}
