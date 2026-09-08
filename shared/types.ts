// Single source of truth for the application shape. Imported by the client
// (src/), the API handlers (api/), and the Drizzle schema (db/).

export const STATUSES = [
  "interested",
  "applied",
  "oa",
  "phone_screen",
  "onsite",
  "offer",
  "rejected",
  "ghosted",
  "withdrawn",
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  interested: "Interested",
  applied: "Applied",
  oa: "OA",
  phone_screen: "Phone screen",
  onsite: "Onsite",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "Ghosted",
  withdrawn: "Withdrawn",
};

/** Stages that mean the company responded to an application. */
export const RESPONSE_STAGES: readonly Status[] = ["oa", "phone_screen", "onsite", "offer"];

/** Stages where the ball is in the company's court and silence goes stale. */
export const IN_FLIGHT_STAGES: readonly Status[] = ["applied", "oa", "phone_screen", "onsite"];

/** Terminal stages; everything else counts as active. */
export const CLOSED_STAGES: readonly Status[] = ["rejected", "ghosted", "withdrawn"];

/** Moving back to one of these walks the application back to square one: a
 *  response recorded before it no longer counts (the later stage was a
 *  mis-click, or the process restarted). */
export const RESET_STAGES: readonly Status[] = ["interested", "applied"];

/** Stages built around something you sit for, so they can be marked done. */
export const COMPLETABLE_STAGES: readonly Status[] = ["oa", "phone_screen", "onsite"];

export const WORK_MODELS = ["onsite", "hybrid", "remote"] as const;
export type WorkModel = (typeof WORK_MODELS)[number];

/** Timeline entry. `details` holds free text for manual entries (interview notes, prep). */
export type ApplicationEvent = { date: string; label: string; details?: string };

export type Contact = {
  name: string;
  email?: string;
  role?: string; // "Recruiter", "Hiring manager", "Referral"
  /** YYYY-MM-DD of the last touch, either direction. */
  lastContact?: string;
};

export type Application = {
  id: string;
  company: string;
  role: string;
  location?: string;
  workModel?: WorkModel;
  url?: string;
  source?: string;
  status: Status;
  appliedDate?: string;
  deadline?: string;
  compensation?: string;
  referral?: string;
  resumeVersion?: string;
  notes?: string;
  nextAction?: string;
  nextActionDate?: string;
  tags?: string[];
  events: ApplicationEvent[];
  contacts?: Contact[];
  /** Attention rules are muted until this date (YYYY-MM-DD). */
  snoozedUntil?: string;
  createdAt: string;
  updatedAt: string;
};

/** Fields the client may send when creating or patching a row. */
export type ApplicationInput = Omit<Application, "id" | "createdAt" | "updatedAt">;
type RequiredInputKeys = "company" | "role" | "status" | "tags" | "events";
type OptionalInput = Omit<ApplicationInput, RequiredInputKeys>;
/** Partial update. Optional fields accept `null`, which clears them. */
export type ApplicationPatch = Partial<Pick<ApplicationInput, RequiredInputKeys>> & {
  [K in keyof OptionalInput]?: OptionalInput[K] | null;
};

/** Payload for POST /api/applications/bulk. The merge is computed client-side
 *  (diff preview), the server applies it in one transaction. */
export type BulkRequest = {
  creates: ApplicationInput[];
  updates: { id: string; patch: ApplicationPatch }[];
};
export type BulkResponse = {
  created: Application[];
  updated: Application[];
};

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

// Status changes are recorded on the events timeline with a fixed label
// prefix so stats can be recomputed from the timeline alone.
const STATUS_EVENT_PREFIX = "Status: ";

export function statusEventLabel(status: Status): string {
  return `${STATUS_EVENT_PREFIX}${STATUS_LABELS[status]}`;
}

export function statusFromEventLabel(label: string): Status | undefined {
  if (!label.startsWith(STATUS_EVENT_PREFIX)) return undefined;
  const name = label.slice(STATUS_EVENT_PREFIX.length);
  return STATUSES.find((s) => STATUS_LABELS[s] === name);
}

// Finishing what a stage asks of you (the OA is submitted, the interview
// happened) is recorded the same way, with its own prefix.
const STAGE_DONE_EVENT_PREFIX = "Completed: ";

export function stageDoneEventLabel(status: Status): string {
  return `${STAGE_DONE_EVENT_PREFIX}${STATUS_LABELS[status]}`;
}

export function stageFromDoneEventLabel(label: string): Status | undefined {
  if (!label.startsWith(STAGE_DONE_EVENT_PREFIX)) return undefined;
  const name = label.slice(STAGE_DONE_EVENT_PREFIX.length);
  return STATUSES.find((s) => STATUS_LABELS[s] === name);
}

/** Today's date as YYYY-MM-DD in the local timezone. */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
