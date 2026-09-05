import type { Status } from "../../shared/types";

/** One muted hue per status; used only for the dot / border, never fills. */
export const STATUS_COLOR: Record<Status, string> = {
  interested: "#a1a1aa",
  applied: "#3b82f6",
  oa: "#f59e0b",
  phone_screen: "#a855f7",
  onsite: "#06b6d4",
  offer: "#22c55e",
  rejected: "#ef4444",
  ghosted: "#71717a",
  withdrawn: "#52525b",
};

export const STATUS_ORDER: Record<Status, number> = {
  interested: 0,
  applied: 1,
  oa: 2,
  phone_screen: 3,
  onsite: 4,
  offer: 5,
  rejected: 6,
  ghosted: 7,
  withdrawn: 8,
};
