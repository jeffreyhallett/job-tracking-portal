import { useEffect, useRef } from "react";
import { attentionReasons, describeReason, isSnoozed, type AttentionReason } from "../../shared/attention";
import { daysSince, formatDate, formatRelativeDays } from "../../shared/dates";
import type { Column, TableColumnKey } from "../../shared/prefs";
import type { StageSet } from "../../shared/stages";
import { stageCompletedOn } from "../../shared/timeline";
import type { Application, Status } from "../../shared/types";
import { useSession } from "../lib/session";
import { sortApps, type Sort, type SortKey } from "../lib/sort";
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

/**
 * Narrowest screen a column earns room on. Columns not listed here are always
 * shown. This is the one bit of the table that is not driven by the user's
 * preferences: a phone cannot hold twelve columns however they are ordered, and
 * the container scrolls sideways for anything that does not fit.
 */
const BREAKPOINT: Partial<Record<TableColumnKey, "sm" | "md" | "lg">> = {
  appliedDate: "sm",
  nextActionDate: "sm",
  location: "md",
  workModel: "md",
  compensation: "md",
  tags: "md",
  deadline: "lg",
  source: "lg",
  referral: "lg",
  resumeVersion: "lg",
};

const RESPONSIVE: Record<"sm" | "md" | "lg", string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

/** Fixed widths that keep the date and status columns from wobbling. */
const WIDTH: Partial<Record<TableColumnKey, string>> = {
  status: "w-[88px] sm:w-[140px]",
  appliedDate: "w-[84px]",
  deadline: "w-[84px]",
  nextActionDate: "w-[150px]",
  updatedAt: "w-[76px]",
  workModel: "w-[90px]",
};

function cellClass(column: Column): string {
  const responsive = BREAKPOINT[column.key];
  return [responsive ? RESPONSIVE[responsive] : "", WIDTH[column.key] ?? ""].filter(Boolean).join(" ");
}

export function TableView({ apps, errors, now, sort, onSort, focusedId, onOpen, onStatus }: Props) {
  const { visibleColumns, stages } = useSession();
  const sorted = sortApps(apps, sort, stages);

  const onHeader = (key: SortKey) => onSort(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "updatedAt" ? "desc" : "asc" });

  return (
    <div className="flex-1 min-h-0 overflow-auto px-2 sm:px-6 pb-4">
      <div className="card overflow-hidden min-w-max sm:min-w-0 rounded-lg">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-surface-2 z-10">
            <tr className="text-left text-[12px] font-medium text-fg-2">
              {visibleColumns.map((c) => (
                <th key={c.key} className={`font-medium px-2 sm:px-3 h-10 border-b border-line whitespace-nowrap ${cellClass(c)}`}>
                  {c.sortable ? (
                    <button
                      type="button"
                      className="hover:text-fg"
                      onClick={() => onHeader(c.key as SortKey)}
                      aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    >
                      {c.label}
                      <Caret dir={sort.key === c.key ? sort.dir : null} />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              <th className="w-10 border-b border-line hidden sm:table-cell" aria-label="Attention" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const reasons = attentionReasons(a, stages, now);
              const error = errors[a.id];
              const attention = reasons.map(describeReason).join(", ");
              const snoozed = isSnoozed(a, now);
              const completedOn = stageCompletedOn(a, stages);
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
                  {visibleColumns.map((c) =>
                    c.key === "status" ? (
                      <td key={c.key} className={`px-2 sm:px-3 py-2 align-top ${cellClass(c)}`} onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-flex items-center" style={{ ["--sc" as string]: stages.color(a.status) }}>
                          {/* Phone: readable pill with the native select laid invisibly on top (16px fonts stop Safari zooming). */}
                          <span className="pill sm:hidden max-w-[84px]">
                            <span className="truncate">{stages.label(a.status)}</span>
                          </span>
                          <select
                            className="pill absolute inset-0 opacity-0 sm:static sm:opacity-100"
                            value={a.status}
                            aria-label={`Status for ${a.company}`}
                            onChange={(e) => onStatus(a.id, e.target.value as Status)}
                          >
                            {/* A row parked in a hidden or removed stage still lists it, or its own value could not be read back. */}
                            {stageOptions(stages, a.status).map((stage) => (
                              <option key={stage.id} value={stage.id}>
                                {stage.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    ) : (
                      <td key={c.key} className={`px-2 sm:px-3 py-2 align-top ${textTone(c.key, reasons)} ${cellClass(c)}`}>
                        <Cell column={c} app={a} now={now} error={error} reasons={reasons} attention={attention} />
                      </td>
                    ),
                  )}
                  <td className="px-2 py-2 align-top hidden sm:table-cell">
                    {completedOn && (
                      <span className="badge badge-ok" title={`${stages.label(a.status)} completed ${completedOn}`}>
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
                <td colSpan={visibleColumns.length + 1} className="px-3 py-8 text-center text-muted">
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

/** The stages a row's picker offers: the visible ones, plus its own if that is not among them. */
export function stageOptions(stages: StageSet, current: string): { id: string; label: string }[] {
  const options = stages.visible.map((s) => ({ id: s.id, label: s.label }));
  if (!options.some((o) => o.id === current)) options.push({ id: current, label: stages.label(current) });
  return options;
}

/** Deadline and next-action cells turn amber when they are the reason a row needs attention. */
function textTone(key: TableColumnKey, reasons: AttentionReason[]): string {
  if (key === "company") return "font-medium";
  const warn =
    (key === "deadline" && reasons.some((r) => r.kind === "deadline_soon")) ||
    (key === "nextActionDate" && reasons.some((r) => r.kind === "action_due")) ||
    (key === "updatedAt" && reasons.some((r) => r.kind === "stale"));
  return warn ? "text-warn" : "text-fg-2";
}

type CellProps = { column: Column; app: Application; now: Date; error?: string; reasons: AttentionReason[]; attention: string };

function Cell({ column, app, now, error, reasons, attention }: CellProps) {
  switch (column.key) {
    case "company":
      return (
        <>
          <div className="flex items-center gap-2">
            <CompanyMark company={app.company} url={app.url} size={26} className="hidden sm:inline-flex" />
            <div className="truncate max-w-[20vw] sm:max-w-[160px]">{app.company}</div>
          </div>
          {error && <div className="text-[11px] text-danger font-normal">{error}</div>}
        </>
      );
    case "role":
      return (
        <div className="max-w-[20vw] sm:max-w-[260px]">
          <div className="truncate">{app.role}</div>
          {/* The attention badge column is desktop-only, so phones get the reason here. */}
          {reasons.length > 0 && <div className="text-[11px] text-warn sm:hidden truncate">{attention}</div>}
        </div>
      );
    case "location":
      return <div className="truncate max-w-[160px]">{app.location ?? ""}</div>;
    case "workModel":
      return <span className="capitalize">{app.workModel ?? ""}</span>;
    case "source":
      return <div className="truncate max-w-[140px]">{app.source ?? ""}</div>;
    case "appliedDate":
      return <span className="tabular-nums whitespace-nowrap">{formatDate(app.appliedDate)}</span>;
    case "deadline":
      return <span className="tabular-nums whitespace-nowrap">{formatDate(app.deadline)}</span>;
    case "nextActionDate":
      return (
        <div className="truncate max-w-[150px]">
          {app.nextActionDate && <span className="tabular-nums mr-1">{formatRelativeDays(app.nextActionDate, now)}</span>}
          {app.nextAction}
        </div>
      );
    case "compensation":
      return <div className="truncate max-w-[140px]">{app.compensation ?? ""}</div>;
    case "referral":
      return <div className="truncate max-w-[120px]">{app.referral ?? ""}</div>;
    case "resumeVersion":
      return <div className="truncate max-w-[120px]">{app.resumeVersion ?? ""}</div>;
    case "tags":
      return (
        <div className="flex items-center gap-1 flex-wrap max-w-[160px]">
          {(app.tags ?? []).map((t) => (
            <span key={t} className="badge badge-muted h-5 px-1.5">
              {t}
            </span>
          ))}
        </div>
      );
    case "updatedAt":
      return (
        <span className="tabular-nums whitespace-nowrap" title={new Date(app.updatedAt).toLocaleString()}>
          {relativeUpdated(app.updatedAt, now)}
        </span>
      );
    case "status":
      return null; // rendered inline above, it needs its own <td> handlers
  }
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
