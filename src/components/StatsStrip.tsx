import { useState } from "react";
import { formatDate } from "../../shared/dates";
import type { Stats, WeekBucket } from "../../shared/stats";

const pct = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });

export function StatsStrip({ stats, weeks, shown, total }: { stats: Stats; weeks: WeekBucket[]; shown: number; total: number }) {
  const items: [string, string][] = [
    [String(stats.active), "active"],
    [String(stats.applied), "applied"],
    [stats.responseRate === null ? "—" : pct.format(stats.responseRate), "response rate"],
    [stats.medianDaysToResponse === null ? "—" : formatDays(stats.medianDaysToResponse), "median to response"],
  ];
  return (
    <div className="px-3 sm:px-4 pt-3 pb-2">
      <div className="card flex items-stretch overflow-x-auto [scrollbar-width:none]">
        {items.map(([value, label], i) => (
          <div key={i} className="flex items-baseline gap-1.5 px-4 py-2 border-r border-line whitespace-nowrap">
            <span className="text-[15px] font-semibold tracking-[-0.02em] tabular-nums">{value}</span>
            <span className="text-[12px] text-fg-2">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 px-4 py-1.5 whitespace-nowrap">
          <FunnelChart weeks={weeks} />
          <div className="flex flex-col gap-0.5 text-[11px] text-fg-2 leading-tight">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px]" style={{ background: "var(--chart-1)" }} />
              applied
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px]" style={{ background: "var(--chart-2)" }} />
              responses
            </span>
          </div>
        </div>
        {shown !== total && <div className="ml-auto flex items-center px-4 text-[12px] text-muted whitespace-nowrap">{shown} of {total} shown</div>}
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
  const H = 28;
  const barW = 4;
  const gap = 2;
  const groupW = barW * 2 + gap;
  const step = groupW + 6;
  const W = weeks.length * step - 6;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.applied, w.responses)));
  const y = (v: number) => (v === 0 ? H : H - Math.max(3, (v / max) * H));
  const active = hover === null ? null : weeks[hover];
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H + 2} viewBox={`0 0 ${W} ${H + 2}`} role="img" aria-label="Applications and responses per week">
        {weeks.map((w, i) => {
          const x = i * step;
          return (
            <g key={w.weekStart} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={x - 3} y={0} width={groupW + 6} height={H + 2} fill="transparent" />
              <rect x={x} y={y(w.applied)} width={barW} height={H - y(w.applied) + 1} rx={1.5} fill="var(--chart-1)" opacity={w.applied === 0 ? 0.18 : 1} />
              <rect x={x + barW + gap} y={y(w.responses)} width={barW} height={H - y(w.responses) + 1} rx={1.5} fill="var(--chart-2)" opacity={w.responses === 0 ? 0.18 : 1} />
            </g>
          );
        })}
      </svg>
      {active && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-9 z-10 pointer-events-none whitespace-nowrap rounded-[7px] bg-fg text-bg text-[11px] px-2 py-1 tabular-nums">
          wk of {formatDate(active.weekStart)}: {active.applied} applied, {active.responses} {active.responses === 1 ? "response" : "responses"}
        </div>
      )}
    </div>
  );
}
