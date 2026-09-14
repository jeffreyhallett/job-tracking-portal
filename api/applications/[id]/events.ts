import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { applications } from "../../../db/schema.js";
import { resolveUserStages } from "../../../shared/prefs.js";
import { classifyEventLabel } from "../../../shared/timeline.js";
import { todayISO, type ApplicationEvent } from "../../../shared/types.js";
import { openDb } from "../../_db.js";
import { HttpError } from "../../_error.js";
import { paramId, parseBody, route, serialize } from "../../_http.js";
import { requireUser } from "../../_owner.js";

const bodySchema = z.object({
  label: z.string().trim().min(1).max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").optional(),
  details: z.string().max(20000).optional(),
});

// POST /api/applications/:id/events { label, date?, details? } -> append one
// timeline event atomically and return the row. Meant for agents ("Recruiter
// replied, OA link sent") so they never have to round-trip the whole array.
//
// The label is classified against the caller's own pipeline before it is stored,
// so the entry records what it is:
//
//   "Completed: <stage name>"  -> the marker that says that stage has been sat
//   anything else              -> a note, marked as one
//
// Marking notes matters. Replaying the timeline is how the stats decide what
// counts as a response, and an unmarked entry has to be read back from its text —
// so "Status: Onsite" typed as a description would otherwise be replayed as a
// real move. A note can never be reinterpreted.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    throw new HttpError(405, "Method not allowed");
  }
  const id = paramId(req);
  const body = parseBody(req, bodySchema);
  const { db, close } = openDb();
  try {
    const user = await requireUser(req, res, db);
    const stages = resolveUserStages(user.prefs);
    const classified = classifyEventLabel(body.label, stages);

    // This endpoint only appends to the timeline; it does not move the row. A
    // label that names a stage change would therefore record a move that never
    // happened, so say what to use instead rather than writing something untrue.
    if (classified.kind === "status") {
      throw new HttpError(
        400,
        `"${body.label}" would record a stage change without making one. Use PATCH /api/applications/${id} with {"status": "${classified.status}"}; it writes the timeline entry itself.`,
      );
    }

    const event: ApplicationEvent = {
      date: body.date ?? todayISO(),
      label: body.label,
      ...(body.details ? { details: body.details } : {}),
      ...(classified.kind === "stage_done" ? { status: classified.status, kind: "stage_done" as const } : { kind: "note" as const }),
    };

    const [row] = await db
      .update(applications)
      .set({
        events: sql`coalesce(${applications.events}, '[]'::jsonb) || ${JSON.stringify([event])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(eq(applications.id, id), eq(applications.ownerId, user.id)))
      .returning();
    if (!row) throw new HttpError(404, "Not found");
    res.status(200).json(serialize(row));
  } finally {
    await close();
  }
});
