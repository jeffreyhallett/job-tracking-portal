import { useEffect, useRef } from "react";
import { STATUSES, STATUS_LABELS, type Application, type Status } from "../../shared/types";
import { attentionReasons, describeReason, isSnoozed } from "../../shared/attention";
import { stageCompletedOn } from "../../shared/timeline";
import { daysSince, formatDate, formatRelativeDays } from "../../shared/dates";
import { sortApps, type Sort, type SortKey } from "../lib/sort";
import { STATUS_COLOR } from "../lib/status";
import { CompanyMark } from "./CompanyMark";
import { Icon } from "./Icon";
import { Caret } from "./ui";

type Props = {
  apps: Application[];
  errors: Record<string, string>;
  now: Date;
  sort: Sort;
  onSort: (s: Sort) => void;
  focusedId: string | null;
  onOpen: (id: string) => void;
  onStatus: (id: string, status: Status) => void;
};

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "status", label: "Status", className: "w-[88px] sm:w-[140px]" },
  { key: "company", label: "Company" },
  { key: "role", label: "Role" },
  { key: "location", label: "Location", className: "hidden md:table-cell" },
  { key: "appliedDate", label: "Applied", className: "hidden sm:table-cell w-[84px]" },
  { key: "deadline", label: "Deadline", className: "hidden lg:table-cell w-[84px]" },
  { key: "nextActionDate", label: "Next", className: "hidden sm:table-cell w-[150px]" },
  { key: "updatedAt", label: "Updated", className: "w-[76px]" },
];

export function TableView({ apps, errors, now, sort, onSort, focusedId, onOpen, onStatus }: Props) {
  const sorted = sortApps(apps, sort);

  const onHeader = (key: SortKey) => onSort(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "updatedAt" ? "desc" : "asc" });

  return (
    <div className="flex-1 min-h-0 overflow-auto px-2 sm:px-6 pb-4">
      <div className="card overflow-hidden min-w-max sm:min-w-0 rounded-lg">
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 bg-surface-2 z-10">
          <tr className="text-left text-[12px] font-medium text-fg-2">
            {COLUMNS.map((c) => (
              <th key={c.key} className={`font-medium px-2 sm:px-3 h-10 border-b border-line whitespace-nowrap ${c.className ?? ""}`}>
                <button type="button" className="hover:text-fg" onClick={() => onHeader(c.key)} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.label}
                  <Caret dir={sort.key === c.key ? sort.dir : null} />
                </button>
              </th>
            ))}
            <th className="w-10 border-b border-line hidden sm:table-cell" aria-label="Attention" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => {
            const reasons = attentionReasons(a, now);
            const error = errors[a.id];
            const attention = reasons.map(describeReason).join(", ");
            const snoozed = isSnoozed(a, now);
            const completedOn = stageCompletedOn(a);
            return (
              <Row
                key={a.id}
                focused={focusedId === a.id}
                className={`border-b border-line last:border-0 hover:bg-hover cursor-pointer transition-colors ${focusedId === a.id ? "bg-accent-container/50" : ""}`}
                onClick={() => onOpen(a.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen(a.id);
                }}
                tabIndex={0}
              >
                <td className="px-2 sm:px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                  <div className="relative inline-flex items-center" style={{ ["--sc" as string]: STATUS_COLOR[a.status] }}>
                    {/* Phone: readable pill with the native select laid invisibly on top (16px fonts stop Safari zooming). */}
                    <span className="pill sm:hidden max-w-[84px]">
                      <span className="truncate">{STATUS_LABELS[a.status]}</span>
                    </span>
                    <select
                      className="pill absolute inset-0 opacity-0 sm:static sm:opacity-100"
                      value={a.status}
                      aria-label={`Status for ${a.company}`}
                      onChange={(e) => onStatus(a.id, e.target.value as Status)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-2 sm:px-3 py-2 align-top font-medium">
                  <div className="flex items-center gap-2">
                    <CompanyMark company={a.company} url={a.url} size={26} className="hidden sm:inline-flex" />
                    <div className="truncate max-w-[20vw] sm:max-w-[160px]">{a.company}</div>
                  </div>
                  {error && <div className="text-[11px] text-danger font-normal">{error}</div>}
                </td>
                <td className="px-2 sm:px-3 py-2 align-top text-fg-2">
                  <div className="max-w-[20vw] sm:max-w-[260px]">
                    <div className="truncate">{a.role}</div>
                    {reasons.length > 0 && <div className="text-[11px] text-warn sm:hidden truncate">{attention}</div>}
                  </div>
                </td>
                <td className="px-2 sm:px-3 py-2 align-top text-fg-2 hidden md:table-cell">
                  <div className="truncate max-w-[160px]">{a.location ?? ""}</div>
                </td>
                <td className="px-2 sm:px-3 py-2 align-top text-fg-2 tabular-nums hidden sm:table-cell whitespace-nowrap">{formatDate(a.appliedDate)}</td>
                <td className={`px-2 sm:px-3 py-2 align-top tabular-nums hidden lg:table-cell whitespace-nowrap ${reasons.some((r) => r.kind === "deadline_soon") ? "text-warn" : "text-fg-2"}`}>
                  {formatDate(a.deadline)}
                </td>
                <td className={`px-2 sm:px-3 py-2 align-top hidden sm:table-cell ${reasons.some((r) => r.kind === "action_due") ? "text-warn" : "text-fg-2"}`}>
                  <div className="truncate max-w-[150px]">
                    {a.nextActionDate && <span className="tabular-nums mr-1">{formatRelativeDays(a.nextActionDate, now)}</span>}
                    {a.nextAction}
                  </div>
                </td>
                <td className={`px-2 sm:px-3 py-2 align-top tabular-nums whitespace-nowrap ${reasons.some((r) => r.kind === "stale") ? "text-warn" : "text-fg-2"}`} title={new Date(a.updatedAt).toLocaleString()}>
                  {relativeUpdated(a.updatedAt, now)}
                </td>
                <td className="px-2 py-2 align-top hidden sm:table-cell">
                  {completedOn && (
                    <span className="badge badge-ok" title={`${STATUS_LABELS[a.status]} completed ${completedOn}`}>
                      <Icon name="check" size={12} strokeWidth={2} />
                    </span>
                  )}
                  {reasons.length > 0 && (
                    <span className="badge badge-warn" title={attention}>
                      <Icon name="clock" size={12} strokeWidth={2} />
                    </span>
                  )}
                  {snoozed && (
                    <span className="badge badge-muted" title={`Snoozed until ${a.snoozedUntil ?? ""}`}>
                      <Icon name="moon" size={12} />
                    </span>
                  )}
                </td>
              </Row>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-muted">
                Nothing here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function Row({ focused, children, ...rest }: { focused: boolean } & React.ComponentPropsWithoutRef<"tr">) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest" });
  }, [focused]);
  return (
    <tr ref={ref} {...rest}>
      {children}
    </tr>
  );
}

function relativeUpdated(iso: string, now: Date): string {
  const d = daysSince(iso, now);
  if (d <= 0) return "today";
  if (d === 1) return "1d";
  return `${d}d`;
}
