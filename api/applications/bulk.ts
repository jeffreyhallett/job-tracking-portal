import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bulkRequestSchema } from "../../shared/schemas.js";
import { applyBulk } from "../_apply.js";
import { openDb } from "../_db.js";
import { parseBody, route } from "../_http.js";
import { getOwnerId, HttpError } from "../_owner.js";

// POST /api/applications/bulk -> apply a sync merge in ONE transaction.
// The client computes the merge (creates + per-row patches) and previews it;
// this endpoint only applies it.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    throw new HttpError(405, "Method not allowed");
  }
  const ownerId = getOwnerId(req);
  const body = parseBody(req, bulkRequestSchema);
  const { db, close } = openDb();
  try {
    res.status(200).json(await applyBulk(db, ownerId, body));
  } finally {
    await close();
  }
});
