import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveUserStages } from "../../shared/prefs.js";
import { bulkRequestSchema } from "../../shared/schemas.js";
import { applyBulk } from "../_apply.js";
import { openDb } from "../_db.js";
import { parseBody, route } from "../_http.js";
import { HttpError, requireUser } from "../_owner.js";

// POST /api/applications/bulk -> apply a sync merge in ONE transaction.
// The client computes the merge (creates + per-row patches) and previews it;
// this endpoint only applies it.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    throw new HttpError(405, "Method not allowed");
  }
  const body = parseBody(req, bulkRequestSchema);
  const { db, close } = openDb();
  try {
    const user = await requireUser(req, db);
    res.status(200).json(await applyBulk(db, user.id, body, resolveUserStages(user.prefs)));
  } finally {
    await close();
  }
});
