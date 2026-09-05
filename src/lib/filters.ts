import type { Application, Status } from "../../shared/types";
import { needsAttention } from "./attention";

export type Filters = {
  query: string;
  statuses: Set<Status>;
  tags: Set<string>;
  attention: boolean;
};

export const EMPTY_FILTERS: Filters = { query: "", statuses: new Set(), tags: new Set(), attention: false };

export function isFiltering(f: Filters): boolean {
  return f.query.trim() !== "" || f.statuses.size > 0 || f.tags.size > 0 || f.attention;
}

export function applyFilters(apps: readonly Application[], f: Filters, now: Date): Application[] {
  const q = f.query.trim().toLowerCase();
  return apps.filter((a) => {
    if (f.statuses.size && !f.statuses.has(a.status)) return false;
    if (f.tags.size && !(a.tags ?? []).some((t) => f.tags.has(t))) return false;
    if (f.attention && !needsAttention(a, now)) return false;
    if (q) {
      const hay = `${a.company}\n${a.role}\n${a.notes ?? ""}\n${a.location ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function allTags(apps: readonly Application[]): string[] {
  const counts = new Map<string, number>();
  for (const a of apps) for (const t of a.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([t]) => t);
}
