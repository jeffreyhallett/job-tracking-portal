import type { Stats } from "../lib/stats";

const pct = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });

export function StatsStrip({ stats, shown, total }: { stats: Stats; shown: number; total: number }) {
  const parts = [
    `${stats.active} active`,
    `${stats.applied} applied`,
    stats.responseRate === null ? "response rate —" : `${pct.format(stats.responseRate)} response rate (${stats.responded}/${stats.applied})`,
    stats.medianDaysToResponse === null ? "median response —" : `median ${formatDays(stats.medianDaysToResponse)} to first response`,
  ];
  return (
    <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap px-3 h-auto min-h-7 py-1 text-[12px] text-fg-2 border-b border-line bg-bg tabular-nums">
      {parts.map((t, i) => (
        <span key={i} className="whitespace-nowrap">
          {t}
        </span>
      ))}
      {shown !== total && <span className="ml-auto text-muted whitespace-nowrap">{shown} of {total} shown</span>}
    </div>
  );
}

function formatDays(d: number): string {
  return Number.isInteger(d) ? `${d}d` : `${d.toFixed(1)}d`;
}
