# Agent API

Endpoints for a scheduled Claude task (or any script) to read and update the tracker without the password. Everything is JSON, everything is scoped to the single owner, and every call needs the agent token.

## Auth

Set `AGENT_TOKEN` in the Vercel project (Production at least) to a long random string, for example the output of `openssl rand -hex 32`. It must be at least 16 characters or it is ignored. Send it either way:

```
Authorization: Bearer <AGENT_TOKEN>
```

or, for clients that cannot set headers, as a query parameter: `?token=<AGENT_TOKEN>`. The header is preferred: query strings end up in logs.

The token grants the same access as the password. Rotate it by changing the variable and redeploying.

Base URL below is `https://jobs.jeffreyhallett.com`.

## Endpoints

### `GET /api/agent/digest`

One call with everything a check-in needs.

Query: `activityDays` (default 7, max 90), `horizonDays` (default 14, max 90).

```json
{
  "generatedAt": "2026-09-06T14:00:00.000Z",
  "today": "2026-09-06",
  "counts": { "total": 12, "active": 9, "needsAttention": 3, "snoozed": 1 },
  "pipeline": { "interested": 4, "applied": 3, "oa": 1, "phone_screen": 1, "onsite": 0, "offer": 0, "rejected": 2, "ghosted": 1, "withdrawn": 0 },
  "stats": { "active": 9, "applied": 6, "responded": 2, "responseRate": 0.33, "medianDaysToResponse": 7 },
  "needsAttention": [
    { "id": "…", "company": "Amazon", "role": "SDE I, Leo", "status": "applied", "reasons": ["no movement in 20d"], "updatedAt": "…",
      "contacts": [{ "name": "Sam Recruiter", "email": "sam@example.com", "role": "Recruiter", "lastContact": "2026-08-20" }] }
  ],
  "snoozed": [{ "id": "…", "company": "Ramp", "role": "…", "status": "oa", "snoozedUntil": "2026-09-12" }],
  "upcomingDeadlines": [{ "id": "…", "company": "InstaLILY", "role": "Software Engineer", "status": "interested", "deadline": "2026-09-10", "daysUntil": 4 }],
  "nextActions": [{ "id": "…", "company": "Stripe", "role": "…", "status": "phone_screen", "nextAction": "Prep for recruiter call", "nextActionDate": "2026-09-05", "daysUntil": -1 }],
  "recentActivity": [{ "id": "…", "company": "Ramp", "role": "…", "status": "oa", "date": "2026-09-04", "label": "Status: OA" }]
}
```

`needsAttention` uses the same three rules as the header count and skips anything the user snoozed (those are listed under `snoozed` instead). `contacts` appears on an item when the user has logged people for it, so a follow-up suggestion can name who to write to. `nextActions` includes overdue items (negative `daysUntil`).

### `GET /api/agent/context`

The compact skip-list, identical to the Copy context button: `[{ company, role, url?, status }]`. Paste it into a search prompt so Claude knows what to skip. Contains no notes, compensation, or referral names.

### `GET /api/applications`

Every row in full. Use when the agent needs notes, contacts, or the events timeline. Timeline entries are `{ date, label, details? }`; `details` carries the free text of manual entries (interview notes, prep).

### `GET /api/agent/calendar?token=<AGENT_TOKEN>`

An iCalendar feed of deadlines and next actions for every non-closed application, as all-day events. Subscribe to the URL from Google Calendar (Other calendars → From URL) or Apple Calendar (File → New Calendar Subscription). Calendar apps cannot send headers, which is why this one takes the token as a query parameter.

### `POST /api/agent/import`

Body: either a bare JSON array of postings (exactly what the search prompt asks Claude to return) or

```json
{ "rows": [ … ], "dryRun": false, "acceptStatus": false }
```

Runs the same pipeline as the Sync modal: lenient parsing (only `company` and `role` required), dedupe by normalized URL then fuzzy company + role, then a merge that refreshes posting metadata (location, work model, URL, source, deadline, compensation), fills blanks elsewhere, unions tags, and never overwrites `notes`, `status`, or `events`. `acceptStatus: true` applies status changes the import proposes; default off. `dryRun: true` returns the plan and writes nothing. Everything else is written in one transaction.

Response (201 on write, 200 on dry run):

```json
{
  "dryRun": false,
  "counts": { "created": 2, "updated": 1, "unchanged": 3, "duplicates": 0, "errors": 1 },
  "created": [{ "id": "…", "company": "Databricks", "role": "Software Engineer, New Grad" }],
  "updated": [{ "id": "…", "company": "Stripe", "role": "…", "fields": ["compensation", "deadline"] }],
  "unchanged": [{ "id": "…", "company": "Google", "role": "…" }],
  "errors": [{ "index": 4, "label": "? — Missing company", "messages": ["company: company is required"] }]
}
```

### `PATCH /api/applications/:id`

Partial update. Send only the fields to change; `null` clears an optional field. Status changes should include the timeline event, or use the events endpoint below after patching:

```json
{ "status": "phone_screen", "events": [ …existing events…, { "date": "2026-09-06", "label": "Status: Phone screen" } ] }
```

Simpler for an agent: `PATCH` with `{ "nextAction": "Send thank-you note", "nextActionDate": "2026-09-08" }` and let the person move status in the UI.

### `POST /api/applications/:id/events`

Body `{ "label": "Recruiter replied, OA link sent", "date": "2026-09-06" }` (date optional, defaults to today). Appends one timeline event atomically and bumps `updatedAt`, which clears the "stale" flag. Use this to log things the agent learned from email or a calendar.

To record who was involved, patch `contacts` on the row: `PATCH /api/applications/:id` with `{ "contacts": [ …existing…, { "name": "…", "email": "…", "role": "Recruiter", "lastContact": "2026-09-06" } ] }`. To mute attention on a row for a while: `{ "snoozedUntil": "2026-09-13" }`.

### `DELETE /api/applications/:id`

Removes a row. Agents should not call this without being asked.

## Scheduled task prompt

Paste into a Claude scheduled task, edit the bracketed bits. Works with any Claude surface that can make HTTP requests (Claude Code routines can use curl; other surfaces need the fetch tool and the `?token=` form).

```
You maintain my job application tracker. Base URL: https://jobs.jeffreyhallett.com
Auth: send header "Authorization: Bearer [AGENT_TOKEN]" on every request.

1. GET /api/agent/digest
2. Write me a short update, plain text, in this order and only if non-empty:
   - Needs attention: one line each, "Company — Role: reason". Suggest the single most useful next step for each. If the item has contacts, name the person to write to and how long since lastContact.
   - Deadlines in the next 14 days.
   - Next actions due or overdue.
   - What moved in the last 7 days (recentActivity).
   - Snoozed: one line, "Company (until date)" for each entry in snoozed. No suggestions for these; I muted them on purpose.
   - One line of stats: active, applied, response rate, median days to response.
3. Do not change any data unless a step below says so. Never delete anything.
[Optional, weekly] 4. GET /api/agent/context, then search for new-grad software engineering roles (US, 2027 start) at companies matching: [FILL IN]. Skip anything in the context list. Build a JSON array as described below and POST it to /api/agent/import with {"rows": [...], "dryRun": false}. Report counts.created and counts.updated. Each object: company, role, location, workModel (onsite|hybrid|remote), url, source, deadline (YYYY-MM-DD, omit if unknown), compensation (omit if not posted), tags (array of short strings), notes (one sentence). Omit any field you cannot verify from the posting; do not guess. Set status to "interested".
```

## Local testing

```sh
curl -s -H "Authorization: Bearer $AGENT_TOKEN" http://localhost:3000/api/agent/digest | jq .counts
curl -s -H "Authorization: Bearer $AGENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"rows":[{"company":"Acme","role":"Software Engineer, New Grad","url":"https://acme.com/jobs/1"}],"dryRun":true}' \
  http://localhost:3000/api/agent/import
```
