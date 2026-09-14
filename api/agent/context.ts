import type { VercelRequest, VercelResponse } from "@vercel/node";
import { contextForClaude } from "../../shared/import.js";
import { openDb } from "../_db.js";
import { route } from "../_http.js";
import { HttpError, requireUser } from "../_owner.js";
import { loadAll } from "./_load.js";

// GET /api/agent/context -> [{ id, company, role, url?, status }]
// The "Copy context" payload plus ids, so an agent can PATCH what it matched.
// No notes, compensation, or referral names.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    throw new HttpError(405, "Method not allowed");
  }
  const { db, close } = openDb();
  try {
    const { id: ownerId } = await requireUser(req, res, db);
    const apps = await loadAll(db, ownerId);
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(contextForClaude(apps, true));
  } finally {
    await close();
  }
});
