import { desc, eq } from "drizzle-orm";
import { applications } from "../../db/schema.js";
import type { Application } from "../../shared/types.js";
import type { Db } from "../_db.js";
import { serialize } from "../_http.js";

export async function loadAll(db: Db, ownerId: string): Promise<Application[]> {
  const rows = await db.select().from(applications).where(eq(applications.ownerId, ownerId)).orderBy(desc(applications.updatedAt));
  return rows.map(serialize);
}
