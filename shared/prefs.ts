// Per-user UI preferences: what the pipeline lanes are called, in what order,
// and which ones show; plus the table view's columns. Stored as one jsonb blob
// on the user row so it follows the person across devices, and read by the
// client, the API, and the agent digest.
//
// The canonical Status ids in types.ts never change. A rename is a *label*, so
// the DB check constraint, the events timeline ("Status: Phone screen"), the
// attention rules and the stats all keep working when someone renames a lane.
import { STATUSES, STATUS_LABELS, type Status } from "./types.js";

// ---------------------------------------------------------------------------
// Pipeline lanes
// ---------------------------------------------------------------------------

export type LanePref = {
  status: Status;
  /** Overrides STATUS_LABELS for this user. Absent or blank = use the default. */
  label?: string;
  /** Hidden lanes vanish from the board and the filter row, never from the data. */
  hidden?: boolean;
};

export type Lane = { status: Status; label: string; hidden: boolean; renamed: boolean };

export const MAX_LANE_LABEL = 40;

/**
 * The user's lanes, in display order, with labels resolved.
 *
 * Unknown statuses in the stored prefs are dropped and statuses the prefs never
 * mention are appended in canonical order, so a stale preference blob can never
 * make a stage disappear from the app.
 */
export function resolveLanes(prefs: UserPrefs | undefined): Lane[] {
  const seen = new Set<Status>();
  const lanes: Lane[] = [];
  for (const pref of prefs?.lanes ?? []) {
    if (!isKnownStatus(pref.status) || seen.has(pref.status)) continue;
    seen.add(pref.status);
    const label = pref.label?.trim().slice(0, MAX_LANE_LABEL);
    lanes.push({
      status: pref.status,
      label: label || STATUS_LABELS[pref.status],
      hidden: pref.hidden === true,
      renamed: Boolean(label) && label !== STATUS_LABELS[pref.status],
    });
  }
  for (const status of STATUSES) {
    if (seen.has(status)) continue;
    lanes.push({ status, label: STATUS_LABELS[status], hidden: false, renamed: false });
  }
  return lanes;
}

export function visibleLanes(lanes: readonly Lane[]): Lane[] {
  return lanes.filter((l) => !l.hidden);
}

/** What each status is called for this user. Falls back to the built-in labels. */
export function resolveStatusLabels(prefs: UserPrefs | undefined): Record<Status, string> {
  const labels = { ...STATUS_LABELS };
  for (const lane of resolveLanes(prefs)) labels[lane.status] = lane.label;
  return labels;
}

/** Sort weight per status, following the user's lane order. */
export function resolveStatusOrder(prefs: UserPrefs | undefined): Record<Status, number> {
  const order = {} as Record<Status, number>;
  resolveLanes(prefs).forEach((lane, i) => {
    order[lane.status] = i;
  });
  return order;
}

/** Lane prefs equivalent to "everything as it ships", for seeding the editor. */
export function defaultLanePrefs(): LanePref[] {
  return STATUSES.map((status) => ({ status }));
}

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

export const TABLE_COLUMNS = [
  { key: "status", label: "Status", sortable: true, required: true },
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
 * The user's columns in display order. Same forgiving rules as the lanes:
 * unknown keys dropped, unmentioned columns appended (hidden unless they are
 * on by default), and `status` / `company` can never be hidden.
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

export type UserPrefs = {
  lanes?: LanePref[];
  columns?: ColumnPref[];
};

/** Loose shape the API validates before handing it to normalizePrefs. */
export type UserPrefsInput = {
  lanes?: { status: string; label?: string; hidden?: boolean }[];
  columns?: { key: string; hidden?: boolean }[];
};

/**
 * Canonicalize prefs on the way into the database: unknown statuses and column
 * keys dropped, duplicates collapsed, labels trimmed, and anything that matches
 * the shipped default left out entirely. Keeps the stored blob small and means
 * resolve*() never has to cope with junk it did not write.
 */
export function normalizePrefs(input: UserPrefsInput | undefined): UserPrefs {
  const prefs: UserPrefs = {};

  if (input?.lanes) {
    const seen = new Set<Status>();
    const lanes: LanePref[] = [];
    for (const lane of input.lanes) {
      if (!isKnownStatus(lane.status) || seen.has(lane.status)) continue;
      seen.add(lane.status);
      const label = lane.label?.trim().slice(0, MAX_LANE_LABEL);
      lanes.push({
        status: lane.status,
        ...(label && label !== STATUS_LABELS[lane.status] ? { label } : {}),
        ...(lane.hidden ? { hidden: true } : {}),
      });
    }
    // Statuses the client left out keep their default position at the end.
    for (const status of STATUSES) if (!seen.has(status)) lanes.push({ status });
    prefs.lanes = lanes;
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

function isKnownStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/**
 * Rewrite a stored status event label so it reads in the user's own words.
 * The stored label stays canonical ("Status: Phone screen"); only the display
 * changes, which is what keeps renames from breaking the stats replay.
 */
export function displayEventLabel(label: string, labels: Record<Status, string>): string {
  for (const prefix of ["Status: ", "Completed: "]) {
    if (!label.startsWith(prefix)) continue;
    const name = label.slice(prefix.length);
    const status = STATUSES.find((s) => STATUS_LABELS[s] === name);
    if (status && labels[status] !== name) return `${prefix}${labels[status]}`;
  }
  return label;
}
