import type { VercelRequest, VercelResponse } from "@vercel/node";
import { contextForClaude } from "../../shared/import.js";
import { openDb } from "../_db.js";
import { route } from "../_http.js";
import { getOwnerId, HttpError } from "../_owner.js";
import { loadAll } from "./_load.js";

// GET /api/agent/context -> the compact skip-list: [{ company, role, url?, status }]
// Same payload as the "Copy context" button. No notes, compensation, or
// referral names.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    throw new HttpError(405, "Method not allowed");
  }
  const ownerId = getOwnerId(req);
  const { db, close } = openDb();
  try {
    const apps = await loadAll(db, ownerId);
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(contextForClaude(apps));
  } finally {
    await close();
  }
});
