# Agent API

Endpoints for a scheduled Claude task (or any script) to read and update the tracker without signing in. Everything is JSON, and every call is scoped to the one account whose token it carries.

## Auth

Agent tokens are **per account**, so two people on the same instance each get their own data from the same prompt. Mint one in the app under **Settings → Automations**, or from the command line:

```sh
npm run user:agent-token -- you@example.com
npm run users -- agent-token you@example.com --revoke
```

Only the token's sha256 is stored, so the plaintext is shown once, when it is minted. Lost it? Generate a new one — that also stops the old one working. Send it on every request:

```
Authorization: Bearer <your agent token>
```

Tokens look like `jta_<48 hex chars>`.

A token can read and write that account's applications, and nothing else. It cannot reach `/api/me`, so it can never change the password or mint another token. It cannot see any other account's rows: `owner_id` is in the `WHERE` clause of every query, so a request for someone else's application id gets a 404.

The one exception to the header rule is `/api/agent/calendar`, which also accepts `?token=…` because calendar apps cannot send headers. Prefer the header everywhere else: query strings end up in logs.

> The old instance-wide `AGENT_TOKEN` environment variable is gone. A request still using it gets a 401 saying so; replace it with a per-account token and remove the variable.

Base URL below is `https://jobs.jeffreyhallett.com`.

## Endpoints

### `GET /api/agent/digest`

One call with everything a check-in needs.

Query: `activityDays` (default 7, max 90), `horizonDays` (default 14, max 90).

```json
{
  "generatedAt": "2026-09-06T14:00:00.000Z",
  "today": "2026-09-06",
  "user": {
    "id": "6f1e8b02-…", "email": "you@example.com", "name": "You",
    "stages": [
      { "id": "researching", "label": "Researching", "phase": "lead" },
      { "id": "applied", "label": "Applied", "phase": "waiting" },
      { "id": "portfolio_review", "label": "Portfolio review", "phase": "active" },
      { "id": "offer", "label": "Offer", "phase": "offer" },
      { "id": "passed", "label": "Passed on me", "phase": "closed" },
      { "id": "withdrawn", "label": "Withdrawn", "phase": "closed", "hidden": true }
    ],
    "statusLabels": { "researching": "Researching", "applied": "Applied", "portfolio_review": "Portfolio review", "offer": "Offer", "passed": "Passed on me", "withdrawn": "Withdrawn" }
  },
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

`user` says whose tracker this is, and is how a task written once becomes personal.

**Read `user.stages` rather than assuming a pipeline.** Every account builds its own — stage names, how many there are, and what they mean — so the nine defaults (`interested`, `applied`, `oa`, `phone_screen`, `onsite`, `offer`, `rejected`, `ghosted`, `withdrawn`) are just one possibility. Each entry has:

- **`id`** — what you send in a `PATCH`. Stable for the life of the stage, even when it is renamed.
- **`label`** — what to call it when you write to this person. Say "moved to Portfolio review", not "moved to portfolio_review".
- **`phase`** — what the stage *means*, so you can reason about a pipeline you have never seen:

  | `phase` | Meaning | Useful to know |
  | --- | --- | --- |
  | `lead` | Not applied yet | The deadline still matters |
  | `waiting` | Applied, nothing back | Counts as applied; goes stale when quiet |
  | `active` | In progress with them: interview, test, review | Counts as a response; goes stale when quiet; can be marked complete |
  | `offer` | They made an offer | Counts as a response; never stale |
  | `closed` | Over, however it ended | Stops counting as active |

- **`hidden`** — they took this stage off their board. Do not suggest moving a row into one.

`statusLabels` is the same id-to-label mapping, flattened, for convenience.

### `GET /api/agent/context`

The compact list: `[{ id, company, role, url?, status }]`. Same as the Copy context button plus ids, so an agent can match an email to a row and then PATCH it. Contains no notes, compensation, or referral names.

### `GET /api/applications`

Every row in full. Use when the agent needs notes, contacts, or the events timeline. Timeline entries are `{ date, label, details? }`; `details` carries the free text of manual entries (interview notes, prep).

### `GET /api/agent/calendar?token=<your agent token>`

An iCalendar feed of deadlines and next actions for every non-closed application, as all-day events. Subscribe to the URL from Google Calendar (Other calendars → From URL) or Apple Calendar (File → New Calendar Subscription). Calendar apps cannot send headers, which is why this one — and only this one — takes the token as a query parameter. Anyone who gets hold of that URL has your token, so treat it as a secret; revoking the token kills the feed.

### `POST /api/agent/import`

Body: either a bare JSON array of postings (exactly what the search prompt asks Claude to return) or

```json
{ "rows": [ ... ], "dryRun": false, "acceptStatus": false }
```

Runs the same pipeline as the Sync modal: lenient parsing (only `company` and `role` required), dedupe by normalized URL then fuzzy company + role, then a merge that refreshes posting metadata (location, work model, URL, source, deadline, compensation), fills blanks elsewhere, unions tags, and never overwrites `notes`, `status`, or `events`. A `status` in a row is matched against that account's own stages — by id, by name, then by alias and phase — and a row that matches nothing starts wherever their pipeline starts; omitting it is fine and usually better. `acceptStatus: true` applies status changes the import proposes; default off. `dryRun: true` returns the plan and writes nothing. Everything else is written in one transaction.

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

Partial update. Send only the fields to change; `null` clears an optional field.

`status` must be the **id** of one of that account's own stages — take it from `digest.user.stages`. Anything else is rejected with a 400 listing the ids that are valid, rather than being silently coerced. Use the stage's `label` when you *talk* about it.

A stage change is enough on its own: `{ "status": "phone_screen" }` appends the timeline entry server-side and, for a stage whose phase is `waiting`, fills `appliedDate` if blank. Moving backwards is treated as a correction: moving into a `lead` stage clears `appliedDate`, and the stats stop counting any response logged before the move (they replay the timeline, so a row that briefly touched a later stage and came back is not a response). Do not send `events` from an agent (that replaces the whole array); use the events endpoint below for anything beyond the stage line.

Other useful patches: `{ "nextAction": "Send thank-you note", "nextActionDate": "2026-09-08" }`, `{ "snoozedUntil": "2026-09-13" }`.

### `POST /api/applications/:id/events`

Body `{ "label": "Recruiter replied, OA link sent", "date": "2026-09-06" }` (date optional, defaults to today). Appends one timeline event atomically and bumps `updatedAt`, which clears the "stale" flag. Use this to log things the agent learned from email or a calendar.

To mark the stage a row is in as done — the assessment was submitted, the interview happened — send `"Completed: <the stage's label>"`. It shows as a *done* badge in the app. Only stages the account marked as completable accept it (by default, any stage whose phase is `active`), and only when the row's current stage is the one named.

To record who was involved, patch `contacts` on the row: `PATCH /api/applications/:id` with `{ "contacts": [ …existing…, { "name": "…", "email": "…", "role": "Recruiter", "lastContact": "2026-09-06" } ] }`. To mute attention on a row for a while: `{ "snoozedUntil": "2026-09-13" }`.

### `DELETE /api/applications/:id`

Removes a row. Agents should not call this without being asked.

## Scheduled task prompt

Paste into a Claude scheduled task, edit the bracketed bits. Works with any Claude surface that can make HTTP requests with a header (Claude Code routines can use curl; other surfaces need a fetch tool that lets you set `Authorization`).

Each person sets this up with their own token, so the same text gives each of them their own tracker. The app fills the base URL and token in for you: Settings -> Automations -> Copy prompt.

```
You maintain my job application tracker. Base URL: https://jobs.jeffreyhallett.com
Auth: send header "Authorization: Bearer [YOUR AGENT TOKEN]" on every request.

1. GET /api/agent/digest
2. Read user.stages from that response: my pipeline is mine, not a standard one.
   Send a stage's id in any PATCH, call it by its label when you write to me, and use
   its phase to understand it ("active" = in progress with them, "closed" = over).
   Never suggest moving a row into a stage marked hidden.
3. Write me a short update, plain text, in this order and only if non-empty:
   - Needs attention: one line each, "Company — Role: reason". Suggest the single most useful next step for each. If the item has contacts, name the person to write to and how long since lastContact.
   - Deadlines in the next 14 days.
   - Next actions due or overdue.
   - What moved in the last 7 days (recentActivity).
   - Snoozed: one line, "Company (until date)" for each entry in snoozed. No suggestions for these; I muted them on purpose.
   - One line of stats: active, applied, response rate, median days to response.
4. Do not change any data unless a step below says so. Never delete anything.
[Optional, weekly] 5. GET /api/agent/context, then search for new-grad software engineering roles (US, 2027 start) at companies matching: [FILL IN]. Skip anything in the context list. Build a JSON array as described below and POST it to /api/agent/import with {"rows": [...], "dryRun": false}. Report counts.created and counts.updated. Each object: company, role, location, workModel (onsite|hybrid|remote), url, source, deadline (YYYY-MM-DD, omit if unknown), compensation (omit if not posted), tags (array of short strings), notes (one sentence). Omit any field you cannot verify from the posting; do not guess. Leave status out and each row starts wherever my pipeline starts.
```

## Local testing

```sh
export AGENT_TOKEN="$(npm run --silent user:agent-token -- you@example.com | grep -o 'jta_[0-9a-f]*')"

curl -s -H "Authorization: Bearer $AGENT_TOKEN" http://localhost:3000/api/agent/digest | jq '.user.email, .counts'
curl -s -H "Authorization: Bearer $AGENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"rows":[{"company":"Acme","role":"Software Engineer, New Grad","url":"https://acme.com/jobs/1"}],"dryRun":true}' \
  http://localhost:3000/api/agent/import
```
