import { and, eq, sql } from "drizzle-orm";
import { applications } from "../db/schema.js";
import type { BulkRequest, BulkResponse } from "../shared/types.js";
import type { Db } from "./_db.js";
import { serialize } from "./_http.js";
import { HttpError } from "./_owner.js";

/**
 * Apply a merge (creates + per-row patches) in ONE transaction. Used by the
 * bulk endpoint (client-computed plan) and the agent import endpoint
 * (server-computed plan). Any failure rolls the whole batch back.
 */
export async function applyBulk(db: Db, ownerId: string, body: BulkRequest): Promise<BulkResponse> {
  return db.transaction(async (tx): Promise<BulkResponse> => {
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
          ...(typeof notes === "string" ? { notes: sql`coalesce(nullif(${applications.notes}, ''), ${notes})` } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(applications.id, id), eq(applications.ownerId, ownerId)))
        .returning();
      if (!row) throw new HttpError(404, `Application ${id} not found`);
      updated.push(row);
    }
    return { created: created.map(serialize), updated: updated.map(serialize) };
  });
}
