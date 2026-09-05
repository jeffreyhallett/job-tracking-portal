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
  contextJson: () => string;
};

export function Header(p: Props) {
  return (
    <header className="flex items-center gap-2 h-11 px-3 border-b border-line bg-panel sticky top-0 z-20">
      <h1 className="font-semibold text-sm tracking-tight mr-1">Applications</h1>

      <button
        type="button"
        onClick={p.onToggleAttention}
        className={`btn h-6 px-1.5 gap-1.5 ${p.attentionOn ? "border-warn/60 bg-warn/10" : ""}`}
        title="Show only applications that need attention"
        aria-pressed={p.attentionOn}
      >
        <span className={`w-2 h-2 rounded-full ${p.attentionCount ? "bg-warn" : "bg-line-strong"}`} />
        <span className="tabular-nums">{p.attentionCount}</span>
        <span className="text-fg-2 hidden sm:inline">need attention</span>
      </button>

      <div className="flex-1" />

      {!p.viewLocked && (
        <div className="inline-flex rounded border border-line overflow-hidden" role="tablist" aria-label="View">
          {(["board", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={p.view === v}
              onClick={() => p.onView(v)}
              className={`h-7 px-2 text-[12px] capitalize ${p.view === v ? "bg-hover text-fg" : "text-fg-2 hover:text-fg"}`}
            >
              {v}
            </button>
          ))}
        </div>
      )}

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
