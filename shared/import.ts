import { z } from "zod";
import { DEFAULT_STAGES, type StageSet } from "./stages.js";
import {
  WORK_MODELS,
  statusEvent,
  todayISO,
  type Application,
  type ApplicationInput,
  type ApplicationPatch,
  type BulkRequest,
  type Status,
} from "./types.js";

// ---------------------------------------------------------------------------
// 1. Lenient row schema. Only company + role are required. Everything else is
//    coerced where reasonable and dropped (not rejected) where not.
// ---------------------------------------------------------------------------

const blankToUndefined = (v: unknown): unknown => {
  if (v === null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? undefined : t;
  }
  return v;
};

const optionalText = z.preprocess(blankToUndefined, z.string().max(2000).optional());
const optionalLongText = z.preprocess(blankToUndefined, z.string().max(20000).optional());

const toISODate = (v: unknown): unknown => {
  if (v === null || v === undefined || v === "") return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? v : v.toISOString().slice(0, 10);
  if (typeof v !== "string") return v;
  const s = v.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s; // let the regex below produce the error
  return new Date(t).toISOString().slice(0, 10);
};
const optionalDate = z.preprocess(
  toISODate,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD or ISO date").optional(),
);

/**
 * Free text a model or a spreadsheet might use for a stage, mapped onto the
 * default stage ids. Only consulted when the user's own pipeline has a stage
 * with that id, so an alias never invents a stage somebody does not have.
 */
const STATUS_ALIASES: Record<string, string> = {
  online_assessment: "oa",
  assessment: "oa",
  take_home: "oa",
  takehome: "oa",
  phone: "phone_screen",
  phonescreen: "phone_screen",
  screen: "phone_screen",
  screening: "phone_screen",
  recruiter_screen: "phone_screen",
  recruiter_call: "phone_screen",
  interview: "onsite",
  interviewing: "onsite",
  final: "onsite",
  final_round: "onsite",
  onsite_interview: "onsite",
  offered: "offer",
  reject: "rejected",
  rejection: "rejected",
  declined: "rejected",
  no_response: "ghosted",
  ghost: "ghosted",
  withdrew: "withdrawn",
  wishlist: "interested",
  saved: "interested",
  to_apply: "interested",
  lead: "interested",
  submitted: "applied",
};

const slug = (v: string) => v.trim().toLowerCase().replace(/[\s-]+/g, "_");

/**
 * Resolve whatever the paste said into one of *this user's* stage ids, or
 * undefined when nothing matches — which the planner reads as "no opinion"
 * rather than forcing a guess onto the row.
 */
export function matchStage(raw: string | undefined, stages: StageSet): Status | undefined {
  if (!raw) return undefined;
  const s = slug(raw);
  if (stages.has(s)) return s;

  const byLabel = stages.all.find((stage) => slug(stage.label) === s);
  if (byLabel) return byLabel.id;

  const alias = STATUS_ALIASES[s];
  if (alias && stages.has(alias)) return alias;

  // The alias pointed at a default stage this pipeline does not have. Fall back
  // to a stage in the same phase, which is the closest honest match.
  const aliased = DEFAULT_STAGES.find((stage) => stage.id === alias);
  if (aliased) {
    const sameParse = stages.visible.find((stage) => stage.phase === aliased.phase);
    if (sameParse) return sameParse.id;
  }
  return undefined;
}

const normalizeWorkModel = (v: unknown): unknown => {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (s.startsWith("on") || s === "in office" || s === "in-office" || s === "in_office") return "onsite";
  if (s.startsWith("hy")) return "hybrid";
  if (s.startsWith("rem")) return "remote";
  return undefined;
};

const tagsSchema = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return [];
    if (typeof v === "string") return v.split(/[,;]/);
    return v;
  },
  z
    .array(z.unknown())
    .transform((arr) =>
      Array.from(
        new Set(
          arr
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0 && t.length <= 60),
        ),
      ).slice(0, 50),
    ),
);

export const importRowSchema = z.object({
  company: z.preprocess(blankToUndefined, z.string({ error: "company is required" }).min(1).max(200)),
  role: z.preprocess(blankToUndefined, z.string({ error: "role is required" }).min(1).max(200)),
  location: optionalText,
  workModel: z.preprocess(normalizeWorkModel, z.enum(WORK_MODELS).optional()),
  url: optionalText,
  source: optionalText,
  // `undefined` when the row didn't say; the planner treats that as
  // "interested" for new rows and "no opinion" for existing ones.
  // Kept as the raw string: turning it into a stage needs the user's pipeline,
  // which this schema has no access to. matchStage() does that in the planner.
  status: optionalText,
  appliedDate: optionalDate,
  deadline: optionalDate,
  compensation: optionalText,
  referral: optionalText,
  resumeVersion: optionalText,
  notes: optionalLongText,
  nextAction: optionalText,
  nextActionDate: optionalDate,
  tags: tagsSchema,
});

export type ImportRow = z.infer<typeof importRowSchema>;

export type RowError = { index: number; label: string; messages: string[] };

// ---------------------------------------------------------------------------
// 2. Parsing the paste. Tolerates fences, a wrapping object, or a single row.
// ---------------------------------------------------------------------------

export type ParseResult = { rows: { index: number; row: ImportRow }[]; errors: RowError[]; fatal?: string };

export function parsePaste(text: string): ParseResult {
  let raw = text.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end <= start) return { rows: [], errors: [], fatal: "Not valid JSON. Paste a JSON array of objects." };
    try {
      data = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return { rows: [], errors: [], fatal: "Not valid JSON. Paste a JSON array of objects." };
    }
  }

  let items: unknown[];
  if (Array.isArray(data)) items = data;
  else if (data && typeof data === "object") {
    const firstArray = Object.values(data).find(Array.isArray);
    items = firstArray ?? [data];
  } else return { rows: [], errors: [], fatal: "Expected a JSON array of objects." };

  const rows: ParseResult["rows"] = [];
  const errors: RowError[] = [];
  items.forEach((item, index) => {
    const result = importRowSchema.safeParse(item);
    if (result.success) rows.push({ index, row: result.data });
    else {
      const label = describeItem(item);
      errors.push({
        index,
        label,
        messages: result.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)),
      });
    }
  });
  return { rows, errors };
}

function describeItem(item: unknown): string {
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const c = typeof o.company === "string" ? o.company : "?";
    const r = typeof o.role === "string" ? o.role : "?";
    return `${c} — ${r}`;
  }
  return typeof item === "string" ? item.slice(0, 40) : JSON.stringify(item)?.slice(0, 40) ?? "?";
}

// ---------------------------------------------------------------------------
// 3. Normalization for dedupe.
// ---------------------------------------------------------------------------

const TRACKING_PARAMS = /^(utm_|ref$|referrer$|gh_src$|lever-source|src$|source$|trk$|refId$)/i;

export function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let s = url.trim();
  if (!s) return undefined;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const params = Array.from(u.searchParams.entries())
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}` : "";
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}${query}`;
  } catch {
    return s.toLowerCase();
  }
}

const COMPANY_SUFFIXES = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh)\b/g;
const ROLE_NOISE = /\b(senior|sr|junior|jr|new grad|new graduate|university grad|university graduate|early career|entry level|entry-level|grad|graduate|20\d\d)\b/g;

function squash(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompany(company: string): string {
  return squash(company).replace(COMPANY_SUFFIXES, " ").replace(/\s+/g, " ").trim();
}

export function normalizeRole(role: string): string {
  return squash(role).replace(ROLE_NOISE, " ").replace(/\s+/g, " ").trim();
}

export function fuzzyKey(company: string, role: string): string {
  return `${normalizeCompany(company)}|${normalizeRole(role)}`;
}

// ---------------------------------------------------------------------------
// 4. Planning the merge (the diff preview is rendered from this).
// ---------------------------------------------------------------------------

export type FieldChange = { field: keyof ApplicationInput; before: unknown; after: unknown };

export type PlannedCreate = { index: number; input: ApplicationInput };
export type PlannedUpdate = {
  index: number;
  existing: Application;
  matchedBy: "url" | "name";
  /** Changes applied by default (posting metadata refresh + blank fills). */
  changes: FieldChange[];
  /** Status change the import wants; opt-in, off by default. */
  statusChange?: { from: Status; to: Status };
};
export type PlannedSkip = { index: number; existing: Application; reason: "unchanged" | "duplicate" };

export type ImportPlan = {
  creates: PlannedCreate[];
  updates: PlannedUpdate[];
  skips: PlannedSkip[];
  errors: RowError[];
};

/** Posting metadata: the import is the fresher source, overwrite on change. */
const REFRESH_FIELDS = ["location", "workModel", "url", "source", "deadline", "compensation"] as const;
/** Personal fields: only ever fill a blank. `notes` is deliberately here. */
const FILL_FIELDS = ["notes", "referral", "resumeVersion", "appliedDate", "nextAction", "nextActionDate"] as const;

export function planImport(parsed: ParseResult, existing: readonly Application[], stages: StageSet): ImportPlan {
  const byUrl = new Map<string, Application>();
  const byKey = new Map<string, Application>();
  for (const app of existing) {
    const u = normalizeUrl(app.url);
    if (u && !byUrl.has(u)) byUrl.set(u, app);
    const k = fuzzyKey(app.company, app.role);
    if (!byKey.has(k)) byKey.set(k, app);
  }

  const plan: ImportPlan = { creates: [], updates: [], skips: [], errors: parsed.errors };
  const seenInPaste = new Set<string>(); // ids or keys already handled in this paste

  for (const { index, row } of parsed.rows) {
    const url = normalizeUrl(row.url);
    const key = fuzzyKey(row.company, row.role);
    const match = (url && byUrl.get(url)) || byKey.get(key);
    const matchedBy: "url" | "name" = url && byUrl.get(url) ? "url" : "name";

    if (match) {
      if (seenInPaste.has(match.id)) {
        plan.skips.push({ index, existing: match, reason: "duplicate" });
        continue;
      }
      seenInPaste.add(match.id);
      const { changes, statusChange } = diffRow(match, row, stages);
      if (changes.length === 0 && !statusChange) plan.skips.push({ index, existing: match, reason: "unchanged" });
      else plan.updates.push({ index, existing: match, matchedBy, changes, statusChange });
      continue;
    }

    const pasteKey = url ? `u:${url}` : `k:${key}`;
    if (seenInPaste.has(pasteKey) || seenInPaste.has(`k:${key}`)) {
      // duplicate of an earlier new row in the same paste; keep the first
      const first = plan.creates.find((c) => fuzzyKey(c.input.company, c.input.role) === key);
      if (first) plan.skips.push({ index, existing: toPreview(first.input), reason: "duplicate" });
      continue;
    }
    seenInPaste.add(pasteKey);
    seenInPaste.add(`k:${key}`);
    plan.creates.push({ index, input: toInput(row, stages) });
  }
  return plan;
}

function toPreview(input: ApplicationInput): Application {
  return { ...input, id: "", createdAt: "", updatedAt: "" };
}

function toInput(row: ImportRow, stages: StageSet): ApplicationInput {
  // Nothing recognisable in the paste means the row starts where a new
  // application starts in this pipeline, whatever that stage is called.
  const status = matchStage(row.status, stages) ?? stages.initial().id;
  const today = todayISO();
  const appliedDate = row.appliedDate ?? (stages.isWaiting(status) ? today : undefined);
  const input: ApplicationInput = {
    company: row.company,
    role: row.role,
    status,
    tags: row.tags,
    events: [statusEvent(status, stages.isWaiting(status) && appliedDate ? appliedDate : today, stages)],
  };
  for (const f of [...REFRESH_FIELDS, ...FILL_FIELDS] as const) {
    const v = row[f];
    if (v !== undefined) assign(input, f, v);
  }
  if (appliedDate) input.appliedDate = appliedDate;
  return input;
}

function assign<K extends keyof ApplicationInput>(target: ApplicationInput, key: K, value: ApplicationInput[K]): void {
  target[key] = value;
}

function diffRow(existing: Application, row: ImportRow, stages: StageSet): { changes: FieldChange[]; statusChange?: { from: Status; to: Status } } {
  const changes: FieldChange[] = [];

  for (const f of REFRESH_FIELDS) {
    const after = row[f];
    const before = existing[f];
    if (after === undefined) continue;
    if (f === "url") {
      if (normalizeUrl(before) === normalizeUrl(after)) continue;
    } else if (before === after) continue;
    changes.push({ field: f, before, after });
  }
  for (const f of FILL_FIELDS) {
    const after = row[f];
    const before = existing[f];
    if (after === undefined || (before !== undefined && before !== "")) continue;
    changes.push({ field: f, before, after });
  }
  if (row.tags.length) {
    const current = new Set((existing.tags ?? []).map((t) => t.toLowerCase()));
    const added = row.tags.filter((t) => !current.has(t));
    if (added.length) changes.push({ field: "tags", before: existing.tags ?? [], after: [...(existing.tags ?? []), ...added] });
  }

  const proposed = matchStage(row.status, stages);
  const statusChange = proposed !== undefined && proposed !== existing.status ? { from: existing.status, to: proposed } : undefined;
  return { changes, statusChange };
}

// ---------------------------------------------------------------------------
// 5. Turning the (possibly edited) plan into the bulk request.
// ---------------------------------------------------------------------------

export type PlanSelection = {
  /** ids of existing rows whose update is included (default: all). */
  includeUpdates: Set<string>;
  /** indexes of new rows to create (default: all). */
  includeCreates: Set<number>;
  /** ids of existing rows whose proposed status change is accepted (default: none). */
  acceptStatus: Set<string>;
};

export function defaultSelection(plan: ImportPlan): PlanSelection {
  return {
    includeUpdates: new Set(plan.updates.map((u) => u.existing.id)),
    includeCreates: new Set(plan.creates.map((c) => c.index)),
    acceptStatus: new Set(),
  };
}

export function buildBulkRequest(plan: ImportPlan, sel: PlanSelection, stages: StageSet): BulkRequest {
  const creates = plan.creates.filter((c) => sel.includeCreates.has(c.index)).map((c) => c.input);
  const updates: BulkRequest["updates"] = [];
  const today = todayISO();

  for (const u of plan.updates) {
    if (!sel.includeUpdates.has(u.existing.id)) continue;
    const patch: ApplicationPatch = {};
    // diffRow only lists `notes` when the existing value is blank, and the
    // bulk endpoint applies it with COALESCE, so notes can never be overwritten.
    for (const c of u.changes) applyChange(patch, c);
    if (u.statusChange && sel.acceptStatus.has(u.existing.id)) {
      patch.status = u.statusChange.to;
      patch.events = [...u.existing.events, statusEvent(u.statusChange.to, today, stages)];
      if (stages.isWaiting(u.statusChange.to) && !u.existing.appliedDate && patch.appliedDate === undefined) patch.appliedDate = today;
    }
    if (Object.keys(patch).length) updates.push({ id: u.existing.id, patch });
  }
  return { creates, updates };
}

function applyChange(patch: ApplicationPatch, c: FieldChange): void {
  switch (c.field) {
    case "tags":
      patch.tags = c.after as string[];
      break;
    case "workModel":
      patch.workModel = c.after as ApplicationInput["workModel"];
      break;
    case "location":
    case "url":
    case "source":
    case "deadline":
    case "compensation":
    case "notes":
    case "referral":
    case "resumeVersion":
    case "appliedDate":
    case "nextAction":
    case "nextActionDate":
      patch[c.field] = c.after as string;
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// 6. Export for Claude: the compact skip-list.
// ---------------------------------------------------------------------------

export function contextForClaude(apps: readonly Application[], withIds = false): string {
  const compact = apps.map((a) => {
    const o: { id?: string; company: string; role: string; url?: string; status: Status } = { company: a.company, role: a.role, status: a.status };
    if (withIds) o.id = a.id;
    if (a.url) o.url = a.url;
    return o;
  });
  return JSON.stringify(compact);
}

export const CLAUDE_PROMPT = `Search for new-grad software engineering roles (US, 2027 start) at companies matching: [FILL IN]. Skip anything already in this list:
[PASTE CONTEXT]
Return only a JSON array, no prose, no markdown fences. Each object: \`company\`, \`role\`, \`location\`, \`workModel\` (onsite|hybrid|remote), \`url\`, \`source\`, \`deadline\` (YYYY-MM-DD, omit if unknown), \`compensation\` (omit if not posted), \`tags\` (array of short strings), \`notes\` (one sentence on why it fits or anything unusual about the process). Omit any field you can't verify from the posting — do not guess. Leave \`status\` out entirely; each row will start at the beginning of my pipeline.`;
