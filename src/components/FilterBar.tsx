import { STATUSES, STATUS_LABELS, type Status } from "../../shared/types";
import { EMPTY_FILTERS, isFiltering, type Filters } from "../lib/filters";
import { StatusDot } from "./ui";

type Props = { filters: Filters; onChange: (f: Filters) => void; tags: string[] };

export function FilterBar({ filters, onChange, tags }: Props) {
  const toggleStatus = (s: Status) => {
    const next = new Set(filters.statuses);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onChange({ ...filters, statuses: next });
  };
  const toggleTag = (t: string) => {
    const next = new Set(filters.tags);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onChange({ ...filters, tags: next });
  };

  return (
    <div className="px-3 py-2 border-b border-line bg-bg flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search company, role, notes"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          aria-label="Search"
        />
        <button
          type="button"
          className={`chip h-7 ${filters.attention ? "chip-on" : ""}`}
          aria-pressed={filters.attention}
          onClick={() => onChange({ ...filters, attention: !filters.attention })}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-warn" />
          Needs attention
        </button>
        {isFiltering(filters) && (
          <button type="button" className="btn btn-ghost text-muted h-6" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible -mx-3 px-3 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip ${filters.statuses.has(s) ? "chip-on" : ""}`}
            aria-pressed={filters.statuses.has(s)}
            onClick={() => toggleStatus(s)}
          >
            <StatusDot status={s} className="w-1.5 h-1.5" />
            {STATUS_LABELS[s]}
          </button>
        ))}
        {tags.length > 0 && <span className="w-px h-4 bg-line mx-1" aria-hidden />}
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            className={`chip ${filters.tags.has(t) ? "chip-on" : ""}`}
            aria-pressed={filters.tags.has(t)}
            onClick={() => toggleTag(t)}
          >
            #{t}
          </button>
        ))}
      </div>
    </div>
  );
}
