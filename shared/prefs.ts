// Per-user UI preferences: the pipeline (see stages.ts) and the table's columns.
// Stored as one jsonb blob on the user row so they follow the person across
// devices, and read by the client, the API, and the agent digest.
import { DEFAULT_STAGES, resolveStages, sanitizeStages, upgradeStagePhases, type Stage, type StageSet } from "./stages.js";

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

export const TABLE_COLUMNS = [
  { key: "status", label: "Stage", sortable: true, required: true },
  { key: "company", label: "Company", sortable: true, required: true },
  { key: "role", label: "Role", sortable: true, required: false },
  { key: "location", label: "Location", sortable: true, required: false },
  { key: "workModel", label: "Work model", sortable: true, required: false },
  { key: "source", label: "Source", sortable: true, required: false },
  { key: "appliedDate", label: "Applied", sortable: true, required: false },
  { key: "deadline", label: "Deadline", sortable: true, required: false },
  { key: "nextActionDate", label: "Next", sortable: true, required: false },
  { key: "compensation", label: "Comp", sortable: true, required: false },
  { key: "referral", label: "Referral", sortable: true, required: false },
  { key: "resumeVersion", label: "Resume", sortable: true, required: false },
  { key: "tags", label: "Tags", sortable: false, required: false },
  { key: "updatedAt", label: "Updated", sortable: true, required: false },
] as const;

export type TableColumnKey = (typeof TABLE_COLUMNS)[number]["key"];
export type TableColumnDef = (typeof TABLE_COLUMNS)[number];

/** Shown by default; the rest are opt-in from Settings. */
const DEFAULT_VISIBLE: readonly TableColumnKey[] = ["status", "company", "role", "location", "appliedDate", "deadline", "nextActionDate", "updatedAt"];

export type ColumnPref = { key: TableColumnKey; hidden?: boolean };
export type Column = TableColumnDef & { hidden: boolean };

const COLUMN_BY_KEY = new Map<string, TableColumnDef>(TABLE_COLUMNS.map((c) => [c.key, c]));

/**
 * The user's columns in display order. Forgiving in the same way the pipeline is:
 * unknown keys dropped, unmentioned columns appended (hidden unless they are on
 * by default), and `status` / `company` can never be hidden.
 */
export function resolveColumns(prefs: UserPrefs | undefined): Column[] {
  const stored = prefs?.columns;
  const seen = new Set<TableColumnKey>();
  const columns: Column[] = [];
  for (const pref of stored ?? []) {
    const def = COLUMN_BY_KEY.get(pref.key);
    if (!def || seen.has(def.key)) continue;
    seen.add(def.key);
    columns.push({ ...def, hidden: def.required ? false : pref.hidden === true });
  }
  for (const def of TABLE_COLUMNS) {
    if (seen.has(def.key)) continue;
    // With no stored prefs at all, fall back to the shipped default set.
    const hidden = def.required ? false : stored === undefined ? !DEFAULT_VISIBLE.includes(def.key) : true;
    columns.push({ ...def, hidden });
  }
  return columns;
}

export function visibleColumns(columns: readonly Column[]): Column[] {
  return columns.filter((c) => !c.hidden);
}

export function defaultColumnPrefs(): ColumnPref[] {
  return TABLE_COLUMNS.map((c) => ({ key: c.key, ...(DEFAULT_VISIBLE.includes(c.key) ? {} : { hidden: true }) }));
}

// ---------------------------------------------------------------------------
// The whole blob
// ---------------------------------------------------------------------------

/**
 * Lane preferences from the version that could only rename the nine built-in
 * stages. Read once and converted to real stages; never written again.
 */
export type LegacyLanePref = { status: string; label?: string; hidden?: boolean };

/**
 * Bumped when stored prefs mean something different from what they used to, so
 * the upgrade runs on a blob written before the change and never again after.
 *
 * 2 — `rejected` and `ghosted` became phases of their own; both had been stored
 *     as `closed`, which kept a rejection from counting as a response.
 */
export const PREFS_VERSION = 2;

export type UserPrefs = {
  stages?: Stage[];
  columns?: ColumnPref[];
  /** What the stored shape means. Absent on anything written before PREFS_VERSION 2. */
  v?: number;
  /** @deprecated superseded by `stages`; still read so nothing is lost. */
  lanes?: LegacyLanePref[];
};

/** The user's pipeline, resolved and ready to ask questions of. */
export function resolveUserStages(prefs: UserPrefs | undefined): StageSet {
  // Legacy lanes are rebuilt from DEFAULT_STAGES every read, so they are already
  // current; only a stored pipeline can be carrying phases from before the split.
  if (prefs?.stages) return resolveStages((prefs.v ?? 1) >= PREFS_VERSION ? prefs.stages : upgradeStagePhases(prefs.stages));
  if (prefs?.lanes) return resolveStages(stagesFromLegacyLanes(prefs.lanes));
  return resolveStages(undefined);
}

/**
 * Apply old lane prefs — order, display label, hidden — on top of the default
 * stages, so an account set up before stages were editable keeps its look.
 */
export function stagesFromLegacyLanes(lanes: readonly LegacyLanePref[]): Stage[] {
  const defaults = new Map(DEFAULT_STAGES.map((s) => [s.id, s]));
  const stages: Stage[] = [];
  const seen = new Set<string>();
  for (const lane of lanes) {
    const base = defaults.get(lane.status);
    if (!base || seen.has(base.id)) continue;
    seen.add(base.id);
    const label = lane.label?.trim();
    stages.push({ ...base, ...(label ? { label: label.slice(0, 40) } : {}), ...(lane.hidden ? { hidden: true } : {}) });
  }
  for (const stage of DEFAULT_STAGES) if (!seen.has(stage.id)) stages.push({ ...stage });
  return stages;
}

/** Loose shape the API validates before handing it to normalizePrefs. */
export type UserPrefsInput = {
  stages?: unknown[];
  columns?: { key: string; hidden?: boolean }[];
  v?: number;
};

/**
 * Canonicalize prefs on the way into the database: the pipeline validated and
 * cleaned by sanitizeStages, unknown column keys dropped, duplicates collapsed.
 * Keeps the stored blob small and means resolve*() never has to cope with junk
 * it did not write. Writing `stages` drops any legacy `lanes`.
 */
export function normalizePrefs(input: UserPrefsInput | undefined): UserPrefs {
  const prefs: UserPrefs = {};

  if (input?.stages) {
    const stages = sanitizeStages(input.stages);
    if (stages) {
      // A submission that does not name the current version may be carrying a
      // pipeline read before the phase split — the columns editor resends the
      // whole blob untouched — so the upgrade has to run on the way in as well
      // as on the way out. The pipeline editor names it, which is what lets a
      // deliberate move back to `closed` survive being saved.
      prefs.stages = (input.v ?? 1) >= PREFS_VERSION ? stages : upgradeStagePhases(stages);
      prefs.v = PREFS_VERSION;
    }
  }

  if (input?.columns) {
    const seen = new Set<TableColumnKey>();
    const columns: ColumnPref[] = [];
    for (const column of input.columns) {
      const def = COLUMN_BY_KEY.get(column.key);
      if (!def || seen.has(def.key)) continue;
      seen.add(def.key);
      columns.push({ key: def.key, ...(column.hidden && !def.required ? { hidden: true } : {}) });
    }
    for (const def of TABLE_COLUMNS) if (!seen.has(def.key)) columns.push({ key: def.key, ...(def.required ? {} : { hidden: true }) });
    prefs.columns = columns;
  }

  return prefs;
}
