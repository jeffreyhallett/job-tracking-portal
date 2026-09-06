import type { VercelRequest, VercelResponse } from "@vercel/node";
import { openDb } from "../_db.js";
import { route } from "../_http.js";
import { getOwnerId, HttpError } from "../_owner.js";
import { buildCalendar } from "./_ics.js";
import { loadAll } from "./_load.js";

// GET /api/agent/calendar?token=<AGENT_TOKEN> -> text/calendar
// Subscribe to it from Google Calendar / Apple Calendar: deadlines and next
// actions for every non-closed application, as all-day events. Calendar apps
// cannot send headers, hence the query-string token.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    throw new HttpError(405, "Method not allowed");
  }
  const ownerId = getOwnerId(req);
  const { db, close } = openDb();
  try {
    const apps = await loadAll(db, ownerId);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="job-applications.ics"');
    res.setHeader("Cache-Control", "private, max-age=300");
    res.status(200).send(buildCalendar(apps, new Date()));
  } finally {
    await close();
  }
});
