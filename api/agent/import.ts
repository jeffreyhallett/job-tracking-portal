import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { buildBulkRequest, defaultSelection, parsePaste, planImport, type ImportPlan } from "../../shared/import.js";
import { applyBulk } from "../_apply.js";
import { openDb } from "../_db.js";
import { parseBody, route } from "../_http.js";
import { getOwnerId, HttpError } from "../_owner.js";
import { loadAll } from "./_load.js";

// Accepts either a bare JSON array (exactly what the Sync prompt asks Claude
// to return) or { rows, dryRun?, acceptStatus? }.
const bodySchema = z.union([
  z.array(z.unknown()),
  z.object({
    rows: z.array(z.unknown()),
    /** Plan only, write nothing. Default false. */
    dryRun: z.boolean().default(false),
    /** Apply status changes the import proposes. Default false: status is yours. */
    acceptStatus: z.boolean().default(false),
  }),
]);

type Summary = {
  dryRun: boolean;
  counts: { created: number; updated: number; unchanged: number; duplicates: number; errors: number };
  created: { company: string; role: string; id?: string }[];
  updated: { id: string; company: string; role: string; fields: string[]; statusChange?: { from: string; to: string; applied: boolean } }[];
  unchanged: { id: string; company: string; role: string }[];
  errors: ImportPlan["errors"];
};

// POST /api/agent/import -> same parse, dedupe, and merge rules as the Sync
// modal, run server-side and applied in one transaction. Never overwrites
// notes, status (unless acceptStatus), or events.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    throw new HttpError(405, "Method not allowed");
  }
  const ownerId = getOwnerId(req);
  const body = parseBody(req, bodySchema);
  const rows = Array.isArray(body) ? body : body.rows;
  const dryRun = Array.isArray(body) ? false : body.dryRun;
  const acceptStatus = Array.isArray(body) ? false : body.acceptStatus;

  const { db, close } = openDb();
  try {
    const existing = await loadAll(db, ownerId);
    const parsed = parsePaste(JSON.stringify(rows));
    if (parsed.fatal) throw new HttpError(400, parsed.fatal);
    const plan = planImport(parsed, existing);
    const sel = defaultSelection(plan);
    if (acceptStatus) for (const u of plan.updates) if (u.statusChange) sel.acceptStatus.add(u.existing.id);

    const summary: Summary = {
      dryRun,
      counts: {
        created: plan.creates.length,
        updated: plan.updates.length,
        unchanged: plan.skips.filter((s) => s.reason === "unchanged").length,
        duplicates: plan.skips.filter((s) => s.reason === "duplicate").length,
        errors: plan.errors.length,
      },
      created: plan.creates.map((c) => ({ company: c.input.company, role: c.input.role })),
      updated: plan.updates.map((u) => ({
        id: u.existing.id,
        company: u.existing.company,
        role: u.existing.role,
        fields: u.changes.map((c) => c.field),
        ...(u.statusChange ? { statusChange: { ...u.statusChange, applied: acceptStatus } } : {}),
      })),
      unchanged: plan.skips.filter((s) => s.reason === "unchanged").map((s) => ({ id: s.existing.id, company: s.existing.company, role: s.existing.role })),
      errors: plan.errors,
    };

    if (!dryRun) {
      const result = await applyBulk(db, ownerId, buildBulkRequest(plan, sel));
      summary.created = result.created.map((a) => ({ id: a.id, company: a.company, role: a.role }));
    }
    res.status(dryRun ? 200 : 201).json(summary);
  } finally {
    await close();
  }
});
