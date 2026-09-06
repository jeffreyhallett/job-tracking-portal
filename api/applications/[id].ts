import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq } from "drizzle-orm";
import { applications } from "../../db/schema.js";
import { applicationPatchSchema } from "../../shared/schemas.js";
import { openDb } from "../_db.js";
import { paramId, parseBody, route, serialize } from "../_http.js";
import { getOwnerId, HttpError } from "../_owner.js";

// PATCH  /api/applications/:id -> partial update
// DELETE /api/applications/:id
export default route(async (req: VercelRequest, res: VercelResponse) => {
  const ownerId = getOwnerId(req);
  const id = paramId(req);
  const { db, close } = openDb();
  try {
    const scope = and(eq(applications.id, id), eq(applications.ownerId, ownerId));

    if (req.method === "PATCH") {
      const patch = parseBody(req, applicationPatchSchema);
      const [row] = await db
        .update(applications)
        .set({ ...patch, updatedAt: new Date() })
        .where(scope)
        .returning();
      if (!row) throw new HttpError(404, "Not found");
      res.status(200).json(serialize(row));
      return;
    }
    if (req.method === "DELETE") {
      const deleted = await db.delete(applications).where(scope).returning({ id: applications.id });
      if (deleted.length === 0) throw new HttpError(404, "Not found");
      res.status(204).end();
      return;
    }
    res.setHeader("Allow", "PATCH, DELETE");
    throw new HttpError(405, "Method not allowed");
  } finally {
    await close();
  }
});
