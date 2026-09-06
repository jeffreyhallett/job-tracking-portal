// UI-only preferences. Real data never lives here.

export type ViewMode = "board" | "table";

const VIEW_KEY = "jobtracker.view";

export function loadView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "table" ? "table" : "board";
  } catch {
    return "board";
  }
}

export function saveView(view: ViewMode): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // private mode etc.; ignore
  }
}

import { DEFAULT_SORT, type Sort, type SortKey } from "./sort";

const SORT_KEY = "jobtracker.sort";
const SORT_KEYS: SortKey[] = ["company", "role", "status", "location", "appliedDate", "deadline", "nextActionDate", "updatedAt"];

export function loadSort(): Sort {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (!raw) return DEFAULT_SORT;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "key" in parsed && "dir" in parsed) {
      const key = parsed.key;
      const dir = parsed.dir;
      if (typeof key === "string" && (SORT_KEYS as string[]).includes(key) && (dir === "asc" || dir === "desc")) return { key: key as SortKey, dir };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SORT;
}

export function saveSort(sort: Sort): void {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(sort));
  } catch {
    // ignore
  }
}
