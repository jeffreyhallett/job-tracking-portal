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

export function Header(p: Props) {
  const subtitle = [`${p.total} tracked`, `${p.active} active`].join(" · ");
  return (
    <header
      className="sticky top-0 z-20 border-b border-line"
      style={{ background: "color-mix(in srgb, var(--c-bg) 82%, transparent)", backdropFilter: "saturate(180%) blur(18px)", WebkitBackdropFilter: "saturate(180%) blur(18px)" }}
    >
      <div className="flex items-center gap-2.5 sm:gap-3 h-16 px-4 sm:px-6">
        <span className="w-9 h-9 rounded-[11px] bg-accent text-accent-fg inline-flex items-center justify-center shrink-0" style={{ boxShadow: "0 1px 2px rgba(20,24,40,.2), inset 0 1px 0 rgba(255,255,255,.14)" }} aria-hidden>
          <Icon name="briefcase" size={19} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h1 className="font-semibold text-[17px] sm:text-[20px] leading-6 tracking-[-0.025em] truncate">Applications</h1>
          <div className="text-[12px] text-fg-2 leading-4 truncate">{subtitle}</div>
        </div>

        <button
          type="button"
          onClick={p.onToggleAttention}
          className={`chip h-8 ml-1 ${p.attentionOn ? "chip-warn" : ""}`}
          style={p.attentionCount && !p.attentionOn ? { color: "var(--c-warn)" } : undefined}
          title="Show only applications that need attention"
          aria-pressed={p.attentionOn}
        >
          <Icon name="clock" size={14} strokeWidth={2} />
          <span className="tabular-nums">{p.attentionCount}</span>
          <span className="hidden sm:inline">need attention</span>
        </button>

        <div className="flex-1" />

        {!p.viewLocked && (
          <div className="seg" role="tablist" aria-label="View">
            {(["board", "table"] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={p.view === v} onClick={() => p.onView(v)} className="seg-item capitalize">
                {p.view === v && <Icon name="check" size={13} strokeWidth={2.2} />}
                {v}
              </button>
            ))}
          </div>
        )}

        <button type="button" className="btn btn-ghost btn-icon hidden sm:inline-flex" onClick={p.onHelp} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
          <Icon name="keyboard" size={18} />
        </button>
        <CopyButton text={p.contextJson} label="Copy context" icon="copy" className="hidden md:inline-flex" />
        <button type="button" className="btn btn-tonal" onClick={p.onSync}>
          <Icon name="sync" size={16} strokeWidth={2} />
          Sync
        </button>
        <button type="button" className="btn btn-primary hidden sm:inline-flex" onClick={p.onNew}>
          <Icon name="plus" size={16} strokeWidth={2.2} />
          New
        </button>
      </div>
    </header>
  );
}
