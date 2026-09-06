import type { Stats } from "../../shared/stats";

const pct = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });

export function StatsStrip({ stats, shown, total }: { stats: Stats; shown: number; total: number }) {
  const parts: [string, string][] = [
    [String(stats.active), "active"],
    [String(stats.applied), "applied"],
    [stats.responseRate === null ? "—" : pct.format(stats.responseRate), `response rate${stats.responseRate === null ? "" : ` (${stats.responded}/${stats.applied})`}`],
    [stats.medianDaysToResponse === null ? "—" : formatDays(stats.medianDaysToResponse), "median to first response"],
  ];
  return (
    <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap px-3 sm:px-4 min-h-8 py-1.5 text-[12px] text-fg-2 tabular-nums">
      {parts.map(([value, label], i) => (
        <span key={i} className="whitespace-nowrap">
          <span className="text-fg font-medium">{value}</span> {label}
        </span>
      ))}
      {shown !== total && (
        <span className="ml-auto text-muted whitespace-nowrap">
          {shown} of {total} shown
        </span>
      )}
    </div>
  );
}

function formatDays(d: number): string {
  return Number.isInteger(d) ? `${d}d` : `${d.toFixed(1)}d`;
}
