// Single source of truth for the application shape. Imported by the client
// (src/), the API handlers (api/), and the Drizzle schema (db/).
//
// What a stage *is* lives in stages.ts, not here: the pipeline is per-user data,
// so this file knows only that a status is a stage id.
import type { StageSet } from "./stages.js";
import { LEGACY_STAGE_LABELS } from "./stages.js";

/**
 * A stage id — `applications.status`. Was a nine-member union; now it is
 * whatever the owning user's pipeline calls its stages. Resolve it through a
 * StageSet to get a label, colour or meaning.
 */
export type Status = string;

export const WORK_MODELS = ["onsite", "hybrid", "remote"] as const;
export type WorkModel = (typeof WORK_MODELS)[number];

/**
 * Timeline entry.
 *
 * `label` is what the user reads. `status` + `kind` are the machine-readable
 * truth for the entries the app writes itself, so replaying the timeline never
 * depends on parsing prose — which is what lets a stage be renamed without
 * invalidating the history recorded under its old name.
 *
 * Entries written before stages carried ids have neither, and are read back from
 * `label` against LEGACY_STAGE_LABELS. `details` holds free text for manual
 * entries (interview notes, prep).
 */
export type ApplicationEvent = {
  date: string;
  label: string;
  details?: string;
  /** The stage this entry is about, for `kind` "status" and "stage_done". */
  status?: Status;
  kind?: "status" | "stage_done";
};

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

/**
 * A create whose stage may be omitted, in which case the server uses wherever
 * the owner's pipeline starts.
 */
export type ApplicationDraft = Omit<ApplicationInput, "status"> & { status?: Status };

/** Payload for POST /api/applications/bulk. The merge is computed client-side
 *  (diff preview), the server applies it in one transaction. */
export type BulkRequest = {
  creates: ApplicationDraft[];
  updates: { id: string; patch: ApplicationPatch }[];
};
export type BulkResponse = {
  created: Application[];
  updated: Application[];
};

// ---------------------------------------------------------------------------
// Timeline entries the app writes for itself
// ---------------------------------------------------------------------------

const STATUS_EVENT_PREFIX = "Status: ";
const STAGE_DONE_EVENT_PREFIX = "Completed: ";

export function statusEventLabel(status: Status, stages: StageSet): string {
  return `${STATUS_EVENT_PREFIX}${stages.label(status)}`;
}

export function stageDoneEventLabel(status: Status, stages: StageSet): string {
  return `${STAGE_DONE_EVENT_PREFIX}${stages.label(status)}`;
}

/** A status-change entry for the timeline. */
export function statusEvent(status: Status, date: string, stages: StageSet): ApplicationEvent {
  return { date, label: statusEventLabel(status, stages), status, kind: "status" };
}

/** A "you have sat this stage" entry for the timeline. */
export function stageDoneEvent(status: Status, date: string, stages: StageSet): ApplicationEvent {
  return { date, label: stageDoneEventLabel(status, stages), status, kind: "stage_done" };
}

/** The stage a status-change entry refers to, or undefined if it is not one. */
export function statusFromEvent(event: ApplicationEvent, stages: StageSet): Status | undefined {
  if (event.kind === "status") return event.status;
  if (event.kind !== undefined) return undefined;
  return stageFromLegacyLabel(event.label, STATUS_EVENT_PREFIX, stages);
}

/** The stage a completion entry refers to, or undefined if it is not one. */
export function stageFromDoneEvent(event: ApplicationEvent, stages: StageSet): Status | undefined {
  if (event.kind === "stage_done") return event.status;
  if (event.kind !== undefined) return undefined;
  return stageFromLegacyLabel(event.label, STAGE_DONE_EVENT_PREFIX, stages);
}

/**
 * Read an entry written before events carried ids. Matches the label against
 * the original default labels first — those are frozen, so this keeps working
 * however the user has since renamed things — then against the current labels,
 * which covers entries written while a rename was only a display label.
 */
function stageFromLegacyLabel(label: string, prefix: string, stages: StageSet): Status | undefined {
  if (!label.startsWith(prefix)) return undefined;
  const name = label.slice(prefix.length);
  for (const [id, legacy] of Object.entries(LEGACY_STAGE_LABELS)) {
    if (legacy === name) return id;
  }
  return stages.all.find((stage) => stage.label === name)?.id;
}

/**
 * How a timeline entry should read now. An entry the app wrote is re-rendered
 * from its stage id, so a renamed stage reads in the new words without the
 * stored label ever being rewritten.
 */
export function eventDisplayLabel(event: ApplicationEvent, stages: StageSet): string {
  const status = statusFromEvent(event, stages);
  if (status) return statusEventLabel(status, stages);
  const done = stageFromDoneEvent(event, stages);
  if (done) return stageDoneEventLabel(done, stages);
  return event.label;
}

/** Today's date as YYYY-MM-DD in the local timezone. */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
