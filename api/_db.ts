import { Pool, types } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "../db/schema";

// DATE columns come back as plain "YYYY-MM-DD" strings rather than JS Dates
// (which would shift by timezone on the way to JSON).
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (value: string) => value);

/**
 * One pool per invocation. The WebSocket driver is used (not the HTTP one)
 * because the bulk endpoint needs a real transaction. Always `end()` it.
 */
export function openDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return { db, close: () => pool.end() };
}

export type Db = ReturnType<typeof openDb>["db"];
