import type { Application } from "../../shared/types";
import { STATUS_ORDER } from "./status";

export type SortKey = "company" | "role" | "status" | "location" | "appliedDate" | "deadline" | "nextActionDate" | "updatedAt";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

export const DEFAULT_SORT: Sort = { key: "updatedAt", dir: "desc" };

function compare(a: Application, b: Application, key: SortKey): number {
  if (key === "status") return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  const av = a[key] ?? "";
  const bv = b[key] ?? "";
  if (av === "" && bv !== "") return 1; // blanks last
  if (bv === "" && av !== "") return -1;
  return av.localeCompare(bv, undefined, { sensitivity: "base" });
}

export function sortApps(apps: readonly Application[], sort: Sort): Application[] {
  return [...apps].sort((a, b) => {
    const c = compare(a, b, sort.key);
    return sort.dir === "asc" ? c : -c;
  });
}

/** Board reading order: pipeline column, then most recently updated first. */
export function boardOrder(apps: readonly Application[]): Application[] {
  return [...apps].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.updatedAt.localeCompare(a.updatedAt));
}
