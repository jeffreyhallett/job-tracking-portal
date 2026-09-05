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
