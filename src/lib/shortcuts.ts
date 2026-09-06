import { useEffect } from "react";

export type ShortcutHandlers = {
  newApplication: () => void;
  focusSearch: () => void;
  next: () => void;
  prev: () => void;
  open: () => void;
  close: () => void;
  setStatusIndex: (index: number) => void;
  snooze: () => void;
  toggleView: () => void;
  help: () => void;
};

export const SHORTCUTS: [string, string][] = [
  ["n", "New application"],
  ["/", "Search"],
  ["j / k", "Next / previous application"],
  ["↵ or o", "Open the selected application"],
  ["esc", "Close panel or clear selection"],
  ["1 – 9", "Set status: Interested, Applied, OA, Phone screen, Onsite, Offer, Rejected, Ghosted, Withdrawn"],
  ["s", "Snooze attention for 7 days"],
  ["v", "Switch board / table"],
  ["?", "This list"],
];

function inEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useShortcuts(h: ShortcutHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (inEditable(e.target) && e.target instanceof HTMLElement) e.target.blur();
        h.close();
        return;
      }
      if (inEditable(e.target)) return;
      switch (e.key) {
        case "n":
          e.preventDefault();
          h.newApplication();
          break;
        case "/":
          e.preventDefault();
          h.focusSearch();
          break;
        case "j":
        case "ArrowDown":
          e.preventDefault();
          h.next();
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          h.prev();
          break;
        case "Enter":
        case "o":
          e.preventDefault();
          h.open();
          break;
        case "s":
          e.preventDefault();
          h.snooze();
          break;
        case "v":
          e.preventDefault();
          h.toggleView();
          break;
        case "?":
          e.preventDefault();
          h.help();
          break;
        default:
          if (/^[1-9]$/.test(e.key)) {
            e.preventDefault();
            h.setStatusIndex(Number(e.key) - 1);
          }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h]);
}
