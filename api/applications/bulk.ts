import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq, sql } from "drizzle-orm";
import { applications } from "../../db/schema";
import { bulkRequestSchema } from "../../shared/schemas";
import type { BulkResponse } from "../../shared/types";
import { openDb } from "../_db";
import { parseBody, route, serialize } from "../_http";
import { getOwnerId, HttpError } from "../_owner";

// POST /api/applications/bulk -> apply a sync merge in ONE transaction.
// The client computes the merge (creates + per-row patches) and previews it;
// this endpoint only applies it. Any failure rolls the whole batch back.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    throw new HttpError(405, "Method not allowed");
  }
  const ownerId = getOwnerId(req);
  const body = parseBody(req, bulkRequestSchema);
  const { db, close } = openDb();
  try {
    const result = await db.transaction(async (tx): Promise<BulkResponse> => {
      const created =
        body.creates.length === 0
          ? []
          : await tx
              .insert(applications)
              .values(body.creates.map((c) => ({ ...c, ownerId })))
              .returning();

      const updated = [];
      for (const { id, patch } of body.updates) {
        const { notes, ...rest } = patch;
        const [row] = await tx
          .update(applications)
          .set({
            ...rest,
            // Imported notes only fill a blank, never overwrite what the user wrote.
            ...(typeof notes === "string"
              ? { notes: sql`coalesce(nullif(${applications.notes}, ''), ${notes})` }
              : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(applications.id, id), eq(applications.ownerId, ownerId)))
          .returning();
        if (!row) throw new HttpError(404, `Application ${id} not found`);
        updated.push(row);
      }
      return { created: created.map(serialize), updated: updated.map(serialize) };
    });
    res.status(200).json(result);
  } finally {
    await close();
  }
});
