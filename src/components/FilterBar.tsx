import { useState, type RefObject } from "react";
import { STATUSES, STATUS_LABELS, type Status } from "../../shared/types";
import { EMPTY_FILTERS, isFiltering, type Filters } from "../lib/filters";
import { Icon } from "./Icon";
import { StatusDot } from "./ui";

type Props = { filters: Filters; onChange: (f: Filters) => void; tags: string[]; searchRef?: RefObject<HTMLInputElement | null> };

const TAG_LIST_ID = "tag-filters";

export function FilterBar({ filters, onChange, tags, searchRef }: Props) {
  // Tags are a long, noisy row on a well-tagged list, so they stay folded away
  // until asked for. The toggle keeps the active count while it is closed.
  const [showTags, setShowTags] = useState(false);

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
    <div className="px-4 sm:px-6 pb-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <input
          ref={searchRef}
          type="search"
          className="input search max-w-sm"
          placeholder="Search"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          aria-label="Search company, role, notes"
        />
        <button
          type="button"
          className={`chip h-10 ${filters.attention ? "chip-warn" : ""}`}
          aria-pressed={filters.attention}
          onClick={() => onChange({ ...filters, attention: !filters.attention })}
        >
          <span className="w-2 h-2 rounded-full bg-warn" />
          Needs attention
        </button>
        {isFiltering(filters) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
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
        {tags.length > 0 && (
          <>
            <span className="w-px h-4 bg-line-strong mx-1 shrink-0" aria-hidden />
            <button
              type="button"
              className={`chip ${filters.tags.size > 0 ? "chip-on" : ""}`}
              aria-expanded={showTags}
              aria-controls={TAG_LIST_ID}
              onClick={() => setShowTags((v) => !v)}
            >
              Tags
              {filters.tags.size > 0 && <span className="tabular-nums">· {filters.tags.size}</span>}
              <Icon name="chevron" size={13} strokeWidth={2} className={`transition-transform ${showTags ? "rotate-180" : ""}`} />
            </button>
          </>
        )}
      </div>
      {showTags && tags.length > 0 && (
        <div id={TAG_LIST_ID} className="flex items-center gap-1.5 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {tags.map((t) => (
            <button key={t} type="button" className={`chip ${filters.tags.has(t) ? "chip-on" : ""}`} aria-pressed={filters.tags.has(t)} onClick={() => toggleTag(t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
