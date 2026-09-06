import type { Status } from "../../shared/types";

/** iOS system palette; used only for dots, pills and lane markers, never fills. */
export const STATUS_COLOR: Record<Status, string> = {
  interested: "#8e8e93",
  applied: "#007aff",
  oa: "#ff9500",
  phone_screen: "#af52de",
  onsite: "#30b0c7",
  offer: "#34c759",
  rejected: "#ff3b30",
  ghosted: "#636366",
  withdrawn: "#5e5ce6",
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
