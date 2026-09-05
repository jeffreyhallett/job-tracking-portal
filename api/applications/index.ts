import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc, eq } from "drizzle-orm";
import { applications } from "../../db/schema";
import { applicationInputSchema } from "../../shared/schemas";
import { openDb } from "../_db";
import { parseBody, route, serialize } from "../_http";
import { getOwnerId, HttpError } from "../_owner";

// GET  /api/applications  -> every row for the owner
// POST /api/applications  -> create one
export default route(async (req: VercelRequest, res: VercelResponse) => {
  const ownerId = getOwnerId(req);
  const { db, close } = openDb();
  try {
    if (req.method === "GET") {
      const rows = await db
        .select()
        .from(applications)
        .where(eq(applications.ownerId, ownerId))
        .orderBy(desc(applications.updatedAt));
      res.status(200).json(rows.map(serialize));
      return;
    }
    if (req.method === "POST") {
      const input = parseBody(req, applicationInputSchema);
      const [row] = await db
        .insert(applications)
        .values({ ...input, ownerId })
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
