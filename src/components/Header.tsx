import type { ViewMode } from "../lib/prefs";
import { Icon } from "./Icon";
import { CopyButton } from "./ui";

type Props = {
  total: number;
  active: number;
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

/** Large title on the page, actions in a floating glass toolbar. */
export function Header(p: Props) {
  const subtitle = [`${p.total} tracked`, `${p.active} active`].join(" · ");
  return (
    <header className="sticky top-0 z-20 px-4 sm:px-6 pt-3 pb-1 pointer-events-none">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 pointer-events-auto pl-1">
          <h1 className="font-bold text-[28px] sm:text-[32px] leading-[1.05] tracking-[-0.03em] truncate">Applications</h1>
          <div className="text-[13px] text-fg-2 leading-4 mt-1 truncate">{subtitle}</div>
        </div>

        <div className="glass rounded-full flex items-center gap-1 p-1.5 pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={p.onToggleAttention}
            className={`chip h-8 ${p.attentionOn ? "chip-warn" : ""}`}
            style={p.attentionCount && !p.attentionOn ? { color: "var(--c-warn)" } : undefined}
            title="Show only applications that need attention"
            aria-pressed={p.attentionOn}
          >
            <Icon name="clock" size={14} strokeWidth={2.2} />
            <span className="tabular-nums">{p.attentionCount}</span>
            <span className="hidden lg:inline">need attention</span>
          </button>

          {!p.viewLocked && (
            <div className="seg" role="tablist" aria-label="View">
              {(["board", "table"] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={p.view === v} onClick={() => p.onView(v)} className="seg-item capitalize">
                  {v}
                </button>
              ))}
            </div>
          )}

          <button type="button" className="btn btn-ghost btn-icon w-8 h-8 hidden sm:inline-flex" onClick={p.onHelp} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Icon name="keyboard" size={18} />
          </button>
          <CopyButton text={p.contextJson} label="Copy context" icon="copy" className="hidden md:inline-flex btn-ghost h-8" />
          <button type="button" className="btn btn-tonal h-8 hidden sm:inline-flex" onClick={p.onSync}>
            <Icon name="sync" size={15} strokeWidth={2.2} />
            Sync
          </button>
          <button type="button" className="btn btn-primary h-8 hidden sm:inline-flex" onClick={p.onNew}>
            <Icon name="plus" size={15} strokeWidth={2.4} />
            New
          </button>
        </div>
      </div>
    </header>
  );
}
