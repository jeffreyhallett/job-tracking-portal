import { useState } from "react";
import { STATUSES, STATUS_LABELS, type Application, type Status } from "../../shared/types";
import { attentionReasons, describeReason } from "../lib/attention";
import { daysSince, formatDate, formatRelativeDays } from "../lib/dates";
import { STATUS_ORDER } from "../lib/status";
import { AttentionDot, Caret, StatusDot } from "./ui";

type SortKey = "company" | "role" | "status" | "location" | "appliedDate" | "deadline" | "nextActionDate" | "updatedAt";
type Sort = { key: SortKey; dir: "asc" | "desc" };

type Props = {
  apps: Application[];
  errors: Record<string, string>;
  now: Date;
  onOpen: (id: string) => void;
  onStatus: (id: string, status: Status) => void;
};

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "status", label: "Status", className: "w-[112px] sm:w-[140px]" },
  { key: "company", label: "Company" },
  { key: "role", label: "Role" },
  { key: "location", label: "Location", className: "hidden md:table-cell" },
  { key: "appliedDate", label: "Applied", className: "hidden sm:table-cell w-[84px]" },
  { key: "deadline", label: "Deadline", className: "hidden lg:table-cell w-[84px]" },
  { key: "nextActionDate", label: "Next", className: "hidden sm:table-cell w-[150px]" },
  { key: "updatedAt", label: "Updated", className: "w-[76px]" },
];

function compare(a: Application, b: Application, key: SortKey): number {
  if (key === "status") return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  const av = a[key] ?? "";
  const bv = b[key] ?? "";
  if (av === "" && bv !== "") return 1; // blanks last
  if (bv === "" && av !== "") return -1;
  return av.localeCompare(bv, undefined, { sensitivity: "base" });
}

export function TableView({ apps, errors, now, onOpen, onStatus }: Props) {
  const [sort, setSort] = useState<Sort>({ key: "updatedAt", dir: "desc" });

  const sorted = [...apps].sort((a, b) => {
    const c = compare(a, b, sort.key);
    return sort.dir === "asc" ? c : -c;
  });

  const onHeader = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "updatedAt" ? "desc" : "asc" }));

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 bg-bg z-10">
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
            {COLUMNS.map((c) => (
              <th key={c.key} className={`font-medium px-2 h-7 border-b border-line whitespace-nowrap ${c.className ?? ""}`}>
                <button type="button" className="hover:text-fg" onClick={() => onHeader(c.key)} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.label}
                  <Caret dir={sort.key === c.key ? sort.dir : null} />
                </button>
              </th>
            ))}
            <th className="w-6 border-b border-line hidden sm:table-cell" aria-label="Attention" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => {
            const reasons = attentionReasons(a, now);
            const error = errors[a.id];
            const attention = reasons.map(describeReason).join(", ");
            return (
              <tr
                key={a.id}
                className="border-b border-line hover:bg-hover cursor-pointer"
                onClick={() => onOpen(a.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen(a.id);
                }}
                tabIndex={0}
              >
                <td className="px-2 py-1 align-top" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={a.status} />
                    <select
                      className="input h-6 py-0 text-[12px] min-w-[84px] sm:min-w-[104px]"
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
                <td className="px-2 py-1 align-top font-medium">
                  <div className="truncate max-w-[22vw] sm:max-w-[180px]">{a.company}</div>
                  {error && <div className="text-[11px] text-danger font-normal">{error}</div>}
                </td>
                <td className="px-2 py-1 align-top text-fg-2">
                  <div className="truncate max-w-[25vw] sm:max-w-[260px]">{a.role}</div>
                  {reasons.length > 0 && <div className="text-[11px] text-warn sm:hidden">{attention}</div>}
                </td>
                <td className="px-2 py-1 align-top text-fg-2 hidden md:table-cell">
                  <div className="truncate max-w-[160px]">{a.location ?? ""}</div>
                </td>
                <td className="px-2 py-1 align-top text-fg-2 tabular-nums hidden sm:table-cell whitespace-nowrap">{formatDate(a.appliedDate)}</td>
                <td className={`px-2 py-1 align-top tabular-nums hidden lg:table-cell whitespace-nowrap ${reasons.some((r) => r.kind === "deadline_soon") ? "text-warn" : "text-fg-2"}`}>
                  {formatDate(a.deadline)}
                </td>
                <td className={`px-2 py-1 align-top hidden sm:table-cell ${reasons.some((r) => r.kind === "action_due") ? "text-warn" : "text-fg-2"}`}>
                  <div className="truncate max-w-[150px]">
                    {a.nextActionDate && <span className="tabular-nums mr-1">{formatRelativeDays(a.nextActionDate, now)}</span>}
                    {a.nextAction}
                  </div>
                </td>
                <td className={`px-2 py-1 align-top tabular-nums whitespace-nowrap ${reasons.some((r) => r.kind === "stale") ? "text-warn" : "text-fg-2"}`} title={new Date(a.updatedAt).toLocaleString()}>
                  {relativeUpdated(a.updatedAt, now)}
                </td>
                <td className="px-1 py-1 align-top hidden sm:table-cell">{reasons.length > 0 && <AttentionDot title={attention} />}</td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-2 py-6 text-center text-muted">
                Nothing here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function relativeUpdated(iso: string, now: Date): string {
  const d = daysSince(iso, now);
  if (d <= 0) return "today";
  if (d === 1) return "1d";
  return `${d}d`;
}
