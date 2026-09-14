import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveUserStages } from "../../shared/prefs.js";
import { openDb } from "../_db.js";
import { route } from "../_http.js";
import { HttpError, requireUser } from "../_owner.js";
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
  const { db, close } = openDb();
  try {
    // The only endpoint that takes ?token=: calendar apps cannot send headers.
    const user = await requireUser(req, db, { allowQueryToken: true });
    const apps = await loadAll(db, user.id);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="job-applications.ics"');
    res.setHeader("Cache-Control", "private, max-age=300");
    res.status(200).send(buildCalendar(apps, resolveUserStages(user.prefs), new Date()));
  } finally {
    await close();
  }
});
