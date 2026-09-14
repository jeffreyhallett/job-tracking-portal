import { TABLE_COLUMNS, type TableColumnKey } from "../../shared/prefs";
import type { StageSet } from "../../shared/stages";
import type { Application } from "../../shared/types";

/** Every column except `tags`, which is an array and has no useful order. */
export type SortKey = Exclude<TableColumnKey, "tags">;
export type Sort = { key: SortKey; dir: "asc" | "desc" };

export const SORT_KEYS: SortKey[] = TABLE_COLUMNS.filter((c) => c.sortable).map((c) => c.key as SortKey);

export const DEFAULT_SORT: Sort = { key: "updatedAt", dir: "desc" };

function compare(a: Application, b: Application, key: SortKey, stages: StageSet): number {
  // Sorting by stage follows the user's own pipeline order, so the table and the
  // board agree about what "earlier in the process" means.
  if (key === "status") return stages.order(a.status) - stages.order(b.status);
  const av = a[key] ?? "";
  const bv = b[key] ?? "";
  if (av === "" && bv !== "") return 1; // blanks last
  if (bv === "" && av !== "") return -1;
  return av.localeCompare(bv, undefined, { sensitivity: "base" });
}

export function sortApps(apps: readonly Application[], sort: Sort, stages: StageSet): Application[] {
  return [...apps].sort((a, b) => {
    const c = compare(a, b, sort.key, stages);
    return sort.dir === "asc" ? c : -c;
  });
}

/** Board reading order: pipeline column, then most recently updated first. */
export function boardOrder(apps: readonly Application[], stages: StageSet): Application[] {
  return [...apps].sort((a, b) => stages.order(a.status) - stages.order(b.status) || b.updatedAt.localeCompare(a.updatedAt));
}
