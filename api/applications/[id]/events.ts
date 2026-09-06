import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { applications } from "../../../db/schema.js";
import { todayISO } from "../../../shared/types.js";
import { openDb } from "../../_db.js";
import { paramId, parseBody, route, serialize } from "../../_http.js";
import { getOwnerId, HttpError } from "../../_owner.js";

const bodySchema = z.object({
  label: z.string().trim().min(1).max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").optional(),
});

// POST /api/applications/:id/events { label, date? } -> append one timeline
// event atomically and return the row. Meant for agents ("Recruiter replied",
// "Sent follow-up") so they never have to round-trip the whole events array.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    throw new HttpError(405, "Method not allowed");
  }
  const ownerId = getOwnerId(req);
  const id = paramId(req);
  const body = parseBody(req, bodySchema);
  const event = { date: body.date ?? todayISO(), label: body.label };
  const { db, close } = openDb();
  try {
    const [row] = await db
      .update(applications)
      .set({
        events: sql`coalesce(${applications.events}, '[]'::jsonb) || ${JSON.stringify([event])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(eq(applications.id, id), eq(applications.ownerId, ownerId)))
      .returning();
    if (!row) throw new HttpError(404, "Not found");
    res.status(200).json(serialize(row));
  } finally {
    await close();
  }
});
