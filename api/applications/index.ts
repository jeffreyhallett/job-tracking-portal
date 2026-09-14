import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc, eq } from "drizzle-orm";
import { applications } from "../../db/schema.js";
import { applicationInputSchema } from "../../shared/schemas.js";
import { openDb } from "../_db.js";
import { assertStage, parseBody, route, serialize } from "../_http.js";
import { HttpError, requireUser } from "../_owner.js";
import { resolveUserStages } from "../../shared/prefs.js";

// GET  /api/applications  -> every row for the signed-in user
// POST /api/applications  -> create one
export default route(async (req: VercelRequest, res: VercelResponse) => {
  const { db, close } = openDb();
  try {
    const user = await requireUser(req, res, db);
    const ownerId = user.id;
    const stages = resolveUserStages(user.prefs);
    if (req.method === "GET") {
      const rows = await db
        .select()
        .from(applications)
        .where(eq(applications.ownerId, ownerId))
        .orderBy(desc(applications.updatedAt));
      // Surfaced in the UI's empty state, so "signed in as someone else than
      // you thought" reads as that rather than as an empty database.
      res.setHeader("X-Owner-Id", ownerId);
      res.setHeader("X-Owner-Email", user.email);
      res.status(200).json(rows.map(serialize));
      return;
    }
    if (req.method === "POST") {
      const input = parseBody(req, applicationInputSchema);
      assertStage(stages, input.status);
      const [row] = await db
        .insert(applications)
        .values({ ...input, status: input.status ?? stages.initial().id, ownerId })
        .returning();
      if (!row) throw new HttpError(500, "Insert returned nothing");
      res.status(201).json(serialize(row));
      return;
    }
    res.setHeader("Allow", "GET, POST");
    throw new HttpError(405, "Method not allowed");
  } finally {
    await close();
  }
});
