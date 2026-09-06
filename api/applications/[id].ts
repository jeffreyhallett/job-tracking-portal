import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { applications } from "../../db/schema.js";
import { applicationPatchSchema } from "../../shared/schemas.js";
import { statusEventLabel, todayISO } from "../../shared/types.js";
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
      const set: PgUpdateSetSource<typeof applications> = { ...patch, updatedAt: new Date() };
      // A status change without an explicit events array (an agent, a script)
      // still gets its "Status: X" timeline entry, and a move to Applied
      // fills appliedDate. The web client sends events itself, so no doubles.
      if (patch.status !== undefined && patch.events === undefined) {
        const today = todayISO();
        const entry = JSON.stringify([{ date: today, label: statusEventLabel(patch.status) }]);
        set.events = sql`case when ${applications.status} is distinct from ${patch.status}
          then coalesce(${applications.events}, '[]'::jsonb) || ${entry}::jsonb
          else coalesce(${applications.events}, '[]'::jsonb) end`;
        if (patch.status === "applied" && patch.appliedDate === undefined) {
          set.appliedDate = sql`coalesce(${applications.appliedDate}, ${today}::date)`;
        }
      }
      const [row] = await db.update(applications).set(set).where(scope).returning();
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
