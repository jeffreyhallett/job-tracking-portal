// The pipeline, as per-user data.
//
// A stage used to be one of nine compile-time constants, and six hardcoded
// lists in types.ts said what each one *meant*: which ones count as a response,
// which go stale when they are quiet, which are terminal. That only works if
// everyone's hiring process is the same shape. It is not — a designer has a
// portfolio review, a consultant has case rounds, some processes have two
// interviews and some have five.
//
// So a stage is now a record the user owns, and its `phase` carries the meaning
// those lists used to. Everything downstream (attention rules, stats, the
// timeline's completion marker, sorting, the agent digest) asks a StageSet
// instead of consulting a constant.
//
// A terminal stage is not one thing, either. "They said no" and "nobody ever
// wrote back" both end a process, but only one of them is the company
// responding to you, and only one of them is silence — so they are separate
// phases rather than one `closed` bucket.
//
// Two things stay fixed on purpose:
//   - A stage's `id` never changes once created. It is what lands in
//     `applications.status` and in timeline events, so renaming a stage cannot
//     orphan history.
//   - The nine default ids are the ones the app shipped with, so existing rows
//     and existing timelines keep resolving with no migration.

// ---------------------------------------------------------------------------
// Phases: the kinds of meaning the app needs from a stage
// ---------------------------------------------------------------------------

export const STAGE_PHASES = ["lead", "waiting", "active", "offer", "rejected", "ghosted", "closed"] as const;
export type StagePhase = (typeof STAGE_PHASES)[number];

export type PhaseInfo = {
  phase: StagePhase;
  /** Short name for the phase picker. */
  title: string;
  /** What choosing it does, in the user's terms. */
  blurb: string;
  /** The consequences, listed in the UI so the choice is not a guess. */
  effects: string[];
};

export const PHASE_INFO: Record<StagePhase, PhaseInfo> = {
  lead: {
    phase: "lead",
    title: "Not applied yet",
    blurb: "Found it, thinking about it, still writing the application.",
    effects: ["Counts as active", "Warns when the deadline is within a week", "Moving back here clears the applied date"],
  },
  waiting: {
    phase: "waiting",
    title: "Waiting to hear back",
    blurb: "Sent, and nothing has come back yet.",
    effects: ["Fills in the applied date", "Counts as applied, for the response rate", "Flagged if it goes quiet for two weeks"],
  },
  active: {
    phase: "active",
    title: "In progress with them",
    blurb: "They replied and something is happening: an interview, a test, a review.",
    effects: ["Counts as a response", "Flagged if it goes quiet for two weeks", "Can be marked complete once you have sat it"],
  },
  offer: {
    phase: "offer",
    title: "Offer",
    blurb: "They have made you an offer.",
    effects: ["Counts as a response", "Never flagged as stale — the ball is with you"],
  },
  rejected: {
    phase: "rejected",
    title: "Rejected",
    blurb: "They came back to you, and the answer was no.",
    effects: ["Counts as applied, for the response rate", "Counts as a response — a no is still a reply", "Stops counting as active", "Never flagged as stale"],
  },
  ghosted: {
    phase: "ghosted",
    title: "Never heard back",
    blurb: "It went out, the trail went cold, and you have written it off.",
    effects: ["Counts as applied, for the response rate", "Does not count as a response", "Stops counting as active", "Never flagged as stale"],
  },
  closed: {
    phase: "closed",
    title: "Closed some other way",
    blurb: "Over without them turning you down: you withdrew, or the role went away.",
    effects: ["Counts as neither applied nor a response", "Stops counting as active", "Never flagged as stale"],
  },
};

// ---------------------------------------------------------------------------
// A stage
// ---------------------------------------------------------------------------

export type Stage = {
  /** Slug, stable for the life of the stage. Stored in applications.status. */
  id: string;
  label: string;
  /** Hex, from STAGE_COLORS. Used for the dot and the pill tint, never a fill. */
  color: string;
  phase: StagePhase;
  /** Hidden stages leave the board and the pickers, never the data. */
  hidden?: boolean;
  /** Overrides the phase default for "can be marked complete". */
  completable?: boolean;
};

export const MAX_STAGE_LABEL = 40;
export const MAX_STAGES = 24;
export const MAX_STAGE_ID = 40;

/** The palette stage colours are picked from, so a custom pipeline still looks like the app. */
export const STAGE_COLORS: { value: string; name: string }[] = [
  { value: "#a1a1aa", name: "Grey" },
  { value: "#71717a", name: "Slate" },
  { value: "#52525b", name: "Graphite" },
  { value: "#3b82f6", name: "Blue" },
  { value: "#06b6d4", name: "Cyan" },
  { value: "#14b8a6", name: "Teal" },
  { value: "#22c55e", name: "Green" },
  { value: "#84cc16", name: "Lime" },
  { value: "#f59e0b", name: "Amber" },
  { value: "#f97316", name: "Orange" },
  { value: "#ef4444", name: "Red" },
  { value: "#ec4899", name: "Pink" },
  { value: "#a855f7", name: "Purple" },
  { value: "#6366f1", name: "Indigo" },
];

const FALLBACK_COLOR = "#a1a1aa";

/**
 * The nine stages the app shipped with. These ids are load-bearing: existing
 * rows carry them in `status`, and existing timeline events carry their labels.
 */
export const DEFAULT_STAGES: readonly Stage[] = [
  { id: "interested", label: "Interested", color: "#a1a1aa", phase: "lead" },
  { id: "applied", label: "Applied", color: "#3b82f6", phase: "waiting" },
  { id: "oa", label: "OA", color: "#f59e0b", phase: "active" },
  { id: "phone_screen", label: "Phone screen", color: "#a855f7", phase: "active" },
  { id: "onsite", label: "Onsite", color: "#06b6d4", phase: "active" },
  { id: "offer", label: "Offer", color: "#22c55e", phase: "offer" },
  { id: "rejected", label: "Rejected", color: "#ef4444", phase: "rejected" },
  { id: "ghosted", label: "Ghosted", color: "#71717a", phase: "ghosted" },
  { id: "withdrawn", label: "Withdrawn", color: "#52525b", phase: "closed" },
];

/**
 * The original labels of the default stages, frozen forever.
 *
 * Timeline events written before stages carried ids look like
 * `"Status: Phone screen"`, and this map is the only way to read them back. It
 * must never change, even if a default stage's label does.
 */
export const LEGACY_STAGE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  interested: "Interested",
  applied: "Applied",
  oa: "OA",
  phone_screen: "Phone screen",
  onsite: "Onsite",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "Ghosted",
  withdrawn: "Withdrawn",
});

/** A shorter pipeline for a process that is not a multi-round tech loop. */
export const SIMPLE_STAGES: readonly Stage[] = [
  { id: "interested", label: "Interested", color: "#a1a1aa", phase: "lead" },
  { id: "applied", label: "Applied", color: "#3b82f6", phase: "waiting" },
  { id: "interviewing", label: "Interviewing", color: "#a855f7", phase: "active" },
  { id: "offer", label: "Offer", color: "#22c55e", phase: "offer" },
  { id: "rejected", label: "Rejected", color: "#ef4444", phase: "rejected" },
];

export const STAGE_PRESETS: { key: string; name: string; description: string; stages: readonly Stage[] }[] = [
  { key: "default", name: "Software engineering", description: "The nine stages the app ships with: OA, phone screen, onsite.", stages: DEFAULT_STAGES },
  { key: "simple", name: "Simple", description: "Five stages, one interview stage. A good base to build your own from.", stages: SIMPLE_STAGES },
];

// ---------------------------------------------------------------------------
// Phase semantics. These functions are the whole translation from the old
// hardcoded stage lists, and nothing outside this file should branch on a phase
// — `isTerminalPhase` is exported so the editor and the validators do not have
// to spell out which phases end a process.
// ---------------------------------------------------------------------------

/**
 * Terminal: the process is over, whichever way it went. Was CLOSED_STAGES.
 *
 * Three phases end a process, because how it ended changes what the stats may
 * conclude from it. A rejection is a reply; being ghosted is not; withdrawing
 * says nothing about whether the application ever went out.
 */
export const isTerminalPhase = (p: StagePhase): boolean => p === "rejected" || p === "ghosted" || p === "closed";
/** The company owes you a move, so silence goes stale. Was IN_FLIGHT_STAGES. */
const phaseIsInFlight = (p: StagePhase) => p === "waiting" || p === "active";
/** They came back to you — a rejection included, since a no is still an answer. Was RESPONSE_STAGES. */
const phaseIsResponse = (p: StagePhase) => p === "active" || p === "offer" || p === "rejected";
/**
 * Being here means the application went out. Was APPLIED_OR_LATER minus the closed stages.
 *
 * It covers the two terminal phases that can only be reached by applying, so a
 * row imported straight into one still lands in the response rate's denominator
 * — with no timeline to read a date out of, this is the only thing that knows.
 */
const phaseImpliesApplied = (p: StagePhase) => p === "waiting" || p === "active" || p === "offer" || p === "rejected" || p === "ghosted";
/** Moving back here walks progress back. Was RESET_STAGES. */
const phaseResets = (p: StagePhase) => p === "lead" || p === "waiting";
/** Default for "you can sit this and mark it done". Was COMPLETABLE_STAGES. */
const phaseCompletable = (p: StagePhase) => p === "active";

// ---------------------------------------------------------------------------
// StageSet: the resolved pipeline, and the only thing the rest of the app asks
// ---------------------------------------------------------------------------

export type StageSet = {
  /** Every stage in the user's order, hidden ones included. */
  all: Stage[];
  /** The ones that appear on the board and in pickers. */
  visible: Stage[];
  ids: string[];
  has(id: string): boolean;
  /** Never undefined: an id the pipeline does not know gets an inert placeholder. */
  get(id: string): Stage;
  /** True when `get(id)` had to invent the stage. */
  isUnknown(id: string): boolean;
  label(id: string): string;
  color(id: string): string;
  /** Sort weight, following the user's order. Unknown stages sort last. */
  order(id: string): number;
  /** id -> label, for the agent digest. */
  labels(): Record<string, string>;

  isClosed(id: string): boolean;
  isInFlight(id: string): boolean;
  isResponse(id: string): boolean;
  impliesApplied(id: string): boolean;
  resets(id: string): boolean;
  isLead(id: string): boolean;
  isWaiting(id: string): boolean;
  isCompletable(id: string): boolean;

  /** The stage a new application starts in: the first visible lead, else the first stage. */
  initial(): Stage;
};

/**
 * Build the pipeline from stored preferences.
 *
 * Forgiving on purpose: a malformed, stale or hand-edited blob falls back to the
 * defaults rather than leaving someone with no pipeline at all.
 */
export function resolveStages(stored: readonly Stage[] | undefined): StageSet {
  const all = sanitizeStages(stored) ?? DEFAULT_STAGES.map((s) => ({ ...s }));
  return stageSet(all);
}

function stageSet(all: Stage[]): StageSet {
  const byId = new Map(all.map((s) => [s.id, s]));
  const orderOf = new Map(all.map((s, i) => [s.id, i]));
  const placeholders = new Map<string, Stage>();

  const get = (id: string): Stage => {
    const found = byId.get(id);
    if (found) return found;
    let placeholder = placeholders.get(id);
    if (!placeholder) {
      // A row pointing at a stage the pipeline no longer has. Deleting a stage
      // moves its rows, so this should not happen; when it does, the row must
      // stay visible and must not distort the stats, so it is treated as a lead.
      placeholder = { id, label: humanize(id), color: FALLBACK_COLOR, phase: "lead" };
      placeholders.set(id, placeholder);
    }
    return placeholder;
  };
  const phaseOf = (id: string) => get(id).phase;

  return {
    all,
    visible: all.filter((s) => !s.hidden),
    ids: all.map((s) => s.id),
    has: (id) => byId.has(id),
    get,
    isUnknown: (id) => !byId.has(id),
    label: (id) => get(id).label,
    color: (id) => get(id).color,
    order: (id) => orderOf.get(id) ?? all.length,
    labels: () => Object.fromEntries(all.map((s) => [s.id, s.label])),

    isClosed: (id) => isTerminalPhase(phaseOf(id)),
    isInFlight: (id) => phaseIsInFlight(phaseOf(id)),
    isResponse: (id) => phaseIsResponse(phaseOf(id)),
    impliesApplied: (id) => phaseImpliesApplied(phaseOf(id)),
    resets: (id) => phaseResets(phaseOf(id)),
    isLead: (id) => phaseOf(id) === "lead",
    isWaiting: (id) => phaseOf(id) === "waiting",
    isCompletable: (id) => {
      const stage = get(id);
      return stage.completable ?? phaseCompletable(stage.phase);
    },

    initial: () => all.find((s) => !s.hidden && s.phase === "lead") ?? all.find((s) => !s.hidden) ?? get(DEFAULT_STAGES[0]?.id ?? "interested"),
  };
}

/**
 * A stored pipeline written before `rejected` and `ghosted` became phases of
 * their own, brought up to date.
 *
 * Both shipped as `closed`, so a pipeline saved back then still says a rejection
 * is not a response — the very thing the split exists to fix. Keyed on the two
 * shipped ids, and only for a stage still sitting on the old `closed`: a custom
 * terminal stage is left alone, and prefs written since the split carry a
 * version that skips this entirely, so a deliberate choice is never overwritten.
 */
export function upgradeStagePhases(stages: readonly Stage[]): Stage[] {
  const split: Record<string, StagePhase> = { rejected: "rejected", ghosted: "ghosted" };
  return stages.map((stage) => {
    const phase = split[stage.id];
    return phase !== undefined && stage.phase === "closed" ? { ...stage, phase } : { ...stage };
  });
}

/**
 * Validate and clean a stored or submitted pipeline. Returns null when there is
 * nothing usable, so callers fall back to the defaults.
 */
export function sanitizeStages(input: readonly unknown[] | undefined): Stage[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const seen = new Set<string>();
  const stages: Stage[] = [];
  const palette = new Set(STAGE_COLORS.map((c) => c.value));

  for (const raw of input.slice(0, MAX_STAGES)) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<Stage>;
    const id = typeof candidate.id === "string" ? candidate.id.trim().toLowerCase() : "";
    if (!isStageId(id) || seen.has(id)) continue;
    const label = typeof candidate.label === "string" ? candidate.label.trim().slice(0, MAX_STAGE_LABEL) : "";
    const phase = isStagePhase(candidate.phase) ? candidate.phase : "active";
    const color = typeof candidate.color === "string" && palette.has(candidate.color) ? candidate.color : defaultColorFor(id, phase);
    seen.add(id);
    stages.push({
      id,
      label: label || humanize(id),
      color,
      phase,
      ...(candidate.hidden === true ? { hidden: true } : {}),
      // Only stored when it disagrees with the phase default.
      ...(typeof candidate.completable === "boolean" && candidate.completable !== phaseCompletable(phase) ? { completable: candidate.completable } : {}),
    });
  }

  if (stages.length === 0) return null;
  // A pipeline of nothing but terminal stages leaves nowhere to put a live
  // application, which would make the app unusable. Fall back rather than save it.
  if (!stages.some((s) => !s.hidden && !isTerminalPhase(s.phase))) return null;
  return stages;
}

/** Why a submitted pipeline cannot be saved, or null when it is fine. */
export function stagesProblem(stages: readonly Stage[]): string | null {
  if (stages.length === 0) return "Keep at least one stage";
  if (stages.length > MAX_STAGES) return `Keep at most ${MAX_STAGES} stages`;
  const ids = new Set<string>();
  for (const stage of stages) {
    if (!isStageId(stage.id)) return `"${stage.id}" is not a usable stage id`;
    if (ids.has(stage.id)) return `Two stages share the id "${stage.id}"`;
    ids.add(stage.id);
    if (stage.label.trim().length === 0) return "Every stage needs a name";
    if (stage.label.length > MAX_STAGE_LABEL) return `"${stage.label.slice(0, 12)}…" is too long`;
    if (!isStagePhase(stage.phase)) return `"${stage.label}" has no valid phase`;
  }
  if (!stages.some((s) => !s.hidden && !isTerminalPhase(s.phase))) return "Keep at least one visible stage the process can still be live in";
  return null;
}

export function isStageId(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[a-z0-9][a-z0-9_]{0,${MAX_STAGE_ID - 1}}$`).test(value);
}

export function isStagePhase(value: unknown): value is StagePhase {
  return typeof value === "string" && (STAGE_PHASES as readonly string[]).includes(value);
}

/** Slug for a new stage, unique within `existing`. */
export function stageIdFor(label: string, existing: readonly string[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, MAX_STAGE_ID - 3) || "stage";
  const taken = new Set(existing);
  if (!taken.has(base) && isStageId(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `stage_${Date.now().toString(36)}`;
}

/** "phone_screen" -> "Phone screen". Used for unknown ids and blank labels. */
export function humanize(id: string): string {
  const words = id.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function defaultColorFor(id: string, phase: StagePhase): string {
  const shipped = DEFAULT_STAGES.find((s) => s.id === id);
  if (shipped) return shipped.color;
  switch (phase) {
    case "lead":
      return "#a1a1aa";
    case "waiting":
      return "#3b82f6";
    case "active":
      return "#a855f7";
    case "offer":
      return "#22c55e";
    case "rejected":
      return "#ef4444";
    case "ghosted":
      return "#71717a";
    case "closed":
      return "#52525b";
  }
}

/** A colour for a stage the user is about to add, avoiding one already in use. */
export function suggestColor(phase: StagePhase, used: readonly string[]): string {
  const preferred = defaultColorFor("", phase);
  if (!used.includes(preferred)) return preferred;
  return STAGE_COLORS.find((c) => !used.includes(c.value))?.value ?? preferred;
}
