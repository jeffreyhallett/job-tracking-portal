import { TABLE_COLUMNS, type TableColumnKey } from "../../shared/prefs";
import type { Application, Status } from "../../shared/types";

/** Every column except `tags`, which is an array and has no useful order. */
export type SortKey = Exclude<TableColumnKey, "tags">;
export type Sort = { key: SortKey; dir: "asc" | "desc" };

export const SORT_KEYS: SortKey[] = TABLE_COLUMNS.filter((c) => c.sortable).map((c) => c.key as SortKey);

export const DEFAULT_SORT: Sort = { key: "updatedAt", dir: "desc" };

export type StatusOrder = Record<Status, number>;

function compare(a: Application, b: Application, key: SortKey, statusOrder: StatusOrder): number {
  // Sorting by status follows the user's own lane order, so the table and the
  // board agree about what "earlier in the pipeline" means.
  if (key === "status") return (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
  const av = a[key] ?? "";
  const bv = b[key] ?? "";
  if (av === "" && bv !== "") return 1; // blanks last
  if (bv === "" && av !== "") return -1;
  return av.localeCompare(bv, undefined, { sensitivity: "base" });
}

export function sortApps(apps: readonly Application[], sort: Sort, statusOrder: StatusOrder): Application[] {
  return [...apps].sort((a, b) => {
    const c = compare(a, b, sort.key, statusOrder);
    return sort.dir === "asc" ? c : -c;
  });
}

/** Board reading order: pipeline column, then most recently updated first. */
export function boardOrder(apps: readonly Application[], statusOrder: StatusOrder): Application[] {
  return [...apps].sort((a, b) => (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0) || b.updatedAt.localeCompare(a.updatedAt));
}
