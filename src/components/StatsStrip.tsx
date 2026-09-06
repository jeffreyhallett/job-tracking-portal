import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDate } from "../../shared/dates";
import type { Stats, WeekBucket } from "../../shared/stats";

const pct = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });

export function StatsStrip({ stats, weeks, shown, total }: { stats: Stats; weeks: WeekBucket[]; shown: number; total: number }) {
  const tiles: { value: string; label: string; hint?: string }[] = [
    { value: String(stats.active), label: "Active" },
    { value: String(stats.applied), label: "Applied" },
    { value: stats.responseRate === null ? "—" : pct.format(stats.responseRate), label: "Response rate", hint: stats.applied ? `${stats.responded} of ${stats.applied}` : undefined },
    { value: stats.medianDaysToResponse === null ? "—" : formatDays(stats.medianDaysToResponse), label: "Median to response" },
  ];
  return (
    <div className="px-4 sm:px-6 pt-3 pb-2">
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 sm:mx-0 sm:px-0 py-1.5 -my-1.5">
        {tiles.map((t) => (
          <div key={t.label} className="tile flex flex-col justify-center px-4 h-16 min-w-[128px] shrink-0">
            <div className="text-[22px] font-semibold tracking-[-0.03em] leading-6 tabular-nums">{t.value}</div>
            <div className="text-[12px] text-fg-2 leading-4 whitespace-nowrap">
              {t.label}
              {t.hint && <span className="text-muted"> · {t.hint}</span>}
            </div>
          </div>
        ))}
        <div className="tile flex items-center gap-4 px-4 h-16 shrink-0">
          <FunnelChart weeks={weeks} />
          <div className="flex flex-col gap-1 text-[11px] text-fg-2 leading-none">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[3px]" style={{ background: "var(--chart-1)" }} />
              applied / wk
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[3px]" style={{ background: "var(--chart-2)" }} />
              responses
            </span>
          </div>
        </div>
        {shown !== total && (
          <div className="ml-auto flex items-center text-[12px] text-muted whitespace-nowrap pl-2">
            {shown} of {total} shown
          </div>
        )}
      </div>
    </div>
  );
}

function formatDays(d: number): string {
  return Number.isInteger(d) ? `${d}d` : `${d.toFixed(1)}d`;
}

/** Applied vs first responses per week, last N weeks. Paired thin bars, hover for values. */
function FunnelChart({ weeks }: { weeks: WeekBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Tooltip is portaled to <body> and positioned below the chart so it can
  // never end up beneath the sticky header or inside a clipping container.
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const show = (i: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) setAnchor({ x: r.left + r.width / 2, y: r.bottom + 8 });
    setHover(i);
  };
  const H = 30;
  const barW = 5;
  const gap = 2;
  const groupW = barW * 2 + gap;
  const step = groupW + 7;
  const W = weeks.length * step - 7;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.applied, w.responses)));
  const y = (v: number) => (v === 0 ? H : H - Math.max(3, (v / max) * H));
  const active = hover === null ? null : weeks[hover];
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg ref={svgRef} width={W} height={H + 2} viewBox={`0 0 ${W} ${H + 2}`} role="img" aria-label="Applications and responses per week">
        {weeks.map((w, i) => {
          const x = i * step;
          return (
            <g key={w.weekStart} onMouseEnter={() => show(i)} onTouchStart={() => show(i)}>
              <rect x={x - 3} y={0} width={groupW + 7} height={H + 2} fill="transparent" />
              <rect x={x} y={y(w.applied)} width={barW} height={H - y(w.applied) + 1} rx={2} fill="var(--chart-1)" opacity={w.applied === 0 ? 0.22 : 1} />
              <rect x={x + barW + gap} y={y(w.responses)} width={barW} height={H - y(w.responses) + 1} rx={2} fill="var(--chart-2)" opacity={w.responses === 0 ? 0.22 : 1} />
            </g>
          );
        })}
      </svg>
      {active &&
        anchor &&
        createPortal(
          <div
            className="fixed z-50 -translate-x-1/2 pointer-events-none whitespace-nowrap rounded-[8px] bg-inverse text-inverse-fg text-[11px] px-2 py-1 tabular-nums"
            style={{ left: anchor.x, top: anchor.y, boxShadow: "var(--shadow-2)" }}
          >
            wk of {formatDate(active.weekStart)}: {active.applied} applied, {active.responses} {active.responses === 1 ? "response" : "responses"}
          </div>,
          document.body,
        )}
    </div>
  );
}
