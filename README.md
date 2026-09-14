# Job application tracker

Single-page tracker for a new-grad SWE search: every application, its stage, and what has gone stale. Board and table views, shared filters, a "needs attention" count, and a careful import path for JSON that Claude hands back.

Multi-user: each person has an account, sees only their own applications, renames the pipeline lanes to suit how they work, and holds their own agent token so a scheduled Claude task is personalised to them.

Stack: React 19 + TypeScript on Vite, Tailwind 4, Zod, Vercel Functions in `/api`, Neon Postgres through `@neondatabase/serverless` + Drizzle.

## Layout

```
api/                 Vercel Functions (thin CRUD, no business logic)
  _owner.ts          requireUser(req, db): the one place auth lives
  _error.ts          HttpError, the only error the route wrapper translates
  _user.ts           the account wire shape + what the agent endpoints expose
  _env.ts            loads .env.local under `vercel dev`; no-op when deployed
  _db.ts             Neon pool + Drizzle client, one per invocation
  auth.ts            POST: email + password -> session token
  me/index.ts        GET/PATCH the account; POST password + agent-token actions
  _http.ts           error wrapper, body parsing, row serialization
  _apply.ts          the one-transaction merge used by bulk and agent import
  applications/
    index.ts         GET (list) / POST (create)
    [id].ts          PATCH (partial update) / DELETE
    [id]/events.ts   POST: append one timeline event
    bulk.ts          POST: sync merge, single transaction
  agent/             endpoints for a scheduled Claude task (docs/AGENT.md)
    digest.ts        GET: needs attention, deadlines, next actions, activity, stats
    context.ts       GET: compact skip-list
    import.ts        POST: server-side version of the Sync merge
db/schema.ts         Drizzle tables: users + applications (constraints, indexes)
drizzle/             generated SQL migrations, checked in
shared/types.ts      Status union + Application shape, imported by client and API
shared/prefs.ts      per-user lane names/order and table columns; resolve + normalize
shared/user.ts       the account wire shape
shared/crypto.ts     scrypt hashing, session MACs, agent tokens (node:crypto)
shared/password.ts   password rules, shared with the browser (no node imports)
shared/schemas.ts    Zod schemas the API validates request bodies with
shared/import.ts     lenient parse, dedupe, diff plan (client preview + agent import)
shared/attention.ts  the "needs attention" rules (header count + agent digest)
shared/stats.ts      stats strip numbers, computed from the events timeline
scripts/seed.ts      inserts three sample rows into one account
scripts/users.ts     account admin: add, list, password, claim, agent-token, remove
docs/AGENT.md        agent endpoints + a scheduled-task prompt
tests/               node:test suites for the crypto and preference rules
src/                 the SPA
  lib/session.tsx    who is signed in + their resolved lane labels and columns
  components/Settings.tsx  lane renaming, table columns, account, agent token
  state/store.ts     useReducer store with optimistic writes + rollback
```

## Setup

### 1. Neon via the Vercel Marketplace

1. Create the Vercel project (import this repo, framework preset Vite).
2. In the project, open **Storage → Create Database → Neon**, accept the defaults, and connect it to the project. This injects `DATABASE_URL` (and a few `PG*` / `POSTGRES_*` aliases) into every environment automatically.
3. Under **Settings → Environment Variables**, add `AUTH_SECRET` (any long random string, e.g. `openssl rand -hex 32`) for all three environments. It is optional but recommended; see "Access control".

### 2. Local environment

```sh
npm install
npm i -g vercel          # if you don't have it
vercel link              # attach this folder to the Vercel project
vercel env pull .env.local
```

`.env.local` now holds the project's *Development* variables. It is git-ignored. `.env.example` lists them if you would rather fill the file by hand.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon connection string. Injected by the Marketplace integration. Server-only; never exposed to the browser. |
| `AUTH_SECRET` | Optional but recommended. Mixed into the session-token signature so a read-only database leak cannot mint sessions. Changing it signs every device out. |
| `API_PROXY_TARGET` | Optional. Where the Vite dev server proxies `/api` (default `http://localhost:3000`). |

There is no `APP_PASSWORD` or `AGENT_TOKEN` any more: passwords live in the `users` table, hashed, and agent tokens are per account. If `AGENT_TOKEN` is still set, a request using it gets a 401 that says so rather than a bare "Unauthorized".

Note on `vercel dev`: it does not read `.env.local` on its own. It uses the variables you assigned to the **Development** environment in the Vercel dashboard (pulled into `.vercel/`). A variable added only to Production is invisible locally. As a convenience the API also loads `.env.local` and `.env` itself when running outside a deployment (`api/_env.ts`), so either place works.

### 3. Migrate and seed

```sh
npm run db:migrate                          # applies drizzle/*.sql to DATABASE_URL
npm run user:add -- you@example.com          # prints a temporary password
npm run db:seed -- you@example.com           # three sample rows (idempotent)
```

`user:add` is the only way accounts are created — there is no sign-up form. It prints a temporary password; the app makes the person replace it the first time they sign in. See "Accounts" below.

Both read `.env.local` (or `.env`) on their own. `drizzle-kit migrate` prints a warning that `@neondatabase/serverless` only connects to remote instances over a websocket; that is expected and not an error. Schema changes go in `db/schema.ts`, then `npm run db:generate` writes a new migration to commit.

#### Which database did that hit?

`vercel env pull .env.local` pulls the **Development** environment. The Neon integration usually gives Development its own Neon branch, so a migrate + seed against `.env.local` populates the dev branch and production stays empty. The seed script prints the host and owner it is about to write to, so you can tell. To set up production:

```sh
vercel env pull .env.production.local --environment=production
npm run db:migrate:prod
npm run db:seed:prod
```

Those two scripts just set `ENV_FILE=.env.production.local`; the first env file that defines a variable wins.

Accounts live in the database, not in environment variables, so the Development and Production databases have separate account lists. Create your account in each environment you intend to sign in to.

### 4. Run locally

Two options.

```sh
vercel dev             # everything on http://localhost:3000: functions + Vite
```

or, for Vite's own dev server with the functions still running under `vercel dev`:

```sh
vercel dev             # terminal 1, serves /api on :3000
npm run dev            # terminal 2, SPA on :5173, proxies /api -> :3000
```

`npm run typecheck` runs `tsc --noEmit` across the client, API, schema, and scripts. `npm test` covers password hashing, session tokens, and the lane-preference rules (see `tests/README.md`). `npm run build` produces `dist/`.

## Deploy

Push to the connected branch and Vercel builds it: `vite build` for the SPA, and each file under `api/` becomes a function. Nothing else to configure; `vercel.json` only pins the framework and the dev command.

After the first deploy, run the migration and seed against production once from your machine (`vercel env pull` gives you the production `DATABASE_URL` when you pick that environment).

### Access control

The site is public, the data is not. Signing in posts an email and password to `POST /api/auth`, which returns a session token the client keeps in `localStorage` and sends as `Authorization: Bearer …` on every call.

Every data handler resolves the caller through `requireUser(req, db)` in `api/_owner.ts` and scopes each query by `user.id`. Nothing else in `/api` knows how a request is authenticated, and no handler reads a row without that scope.

- **Passwords** are scrypt hashes (`shared/crypto.ts`), with the parameters stored alongside each hash so they can be raised later without invalidating what is already written. Minimum 10 characters, enforced in the browser and again on the server from the same `shared/password.ts`.
- **Session tokens** are stateless: an HMAC over (user id, issued-at) keyed on *that user's own password hash* plus `AUTH_SECRET`. So there is no session table, changing a password signs every device out, and setting `AUTH_SECRET` means a read-only database leak still cannot mint a session. Tokens expire after 90 days.
- **Sign-in throttle.** Wrong guesses are counted on the user row and a 15-minute lock kicks in after eight, because serverless functions have no shared memory to rate-limit in. A wrong password and an unknown address get the same delay and the same message, so the response cannot be used to enumerate accounts.
- **Isolation.** `applications.owner_id` holds the user's id, and it is in the `WHERE` clause of every read, update and delete — including the bulk merge, which also re-checks it per row inside the transaction. A request for an id belonging to someone else gets a 404, not their data.

If you can use it, Vercel's **Deployment Protection** (Settings → Deployment Protection) is an additional layer in front of the whole site, but it is not required.

### Accounts

There is no sign-up form. Accounts are created from the command line, which keeps the instance closed without anything to misconfigure:

```sh
npm run user:add -- friend@example.com --name "Friend"   # prints a temporary password
npm run user:list                                        # accounts, row counts, unclaimed rows
npm run user:password -- friend@example.com              # reset; signs that account out everywhere
npm run user:agent-token -- friend@example.com           # mint an agent token from the CLI
npm run users -- remove friend@example.com               # refuses while it still owns applications
npm run users -- help
```

`user:add` prints a temporary password and marks the account `must_change_password`, so the app makes that person choose their own before it shows them anything. Send the temporary one over something private.

In the app, **Settings** (the header's slider icon) holds the account: display name, change password, sign out.

#### Claiming the rows that predate accounts

Applications written before this change carry `owner_id` `'jeffrey'` or `'default'` rather than a user id. `npm run user:list` reports any it finds. Point them at your account with:

```sh
npm run user:add -- you@example.com
npm run user:claim -- you@example.com --from jeffrey --dry-run   # count first
npm run user:claim -- you@example.com --from jeffrey
```

Run it once per environment (the Development and Production databases have separate account lists). Until you do, the old rows exist but no account can read them — nothing is lost, and the app shows an empty list.

### Renaming the pipeline lanes

Each account decides what its own lanes are called, what order they sit in, and which of them show at all: **Settings → Pipeline**. The preferences live on the user row, so they follow the person across devices, and one person's renaming never touches anyone else's board.

Renaming is deliberately cosmetic. The underlying status ids in `shared/types.ts` never change, so:

- the `applications_status_check` constraint and every `Status` type keep holding;
- timeline entries stay canonical (`"Status: Phone screen"`), which is what lets the stats replay a history written before a rename — the UI translates them for display through `displayEventLabel`;
- the attention rules, the funnel and the response-rate maths are unaffected;
- the agent API still speaks status ids, and hands your lane names over separately in `digest.user.statusLabels`.

Hiding a lane hides it from the board, the filter chips and the status pickers — never from the data. Anything sitting in a hidden lane shows up in a muted "Hidden" column at the end of the board with a link back to Settings, and stays visible in the table.

`shared/prefs.ts` resolves stored preferences forgivingly: unknown statuses are dropped, duplicates collapsed, and statuses the blob never mentions are appended in their shipped order. A stale or hand-edited preference blob can never make a stage disappear from the app.

**Settings → Table** does the same for the table view: which of the fourteen columns show, and in what order. Status and Company are always on. On narrow screens a column still needs to earn its width, so some are held back to `sm`/`md`/`lg` breakpoints and the table scrolls sideways for the rest.

### Agent access

Each account mints its own agent token under **Settings → Automations** (or `npm run user:agent-token`), so two people running the same scheduled task each get their own data. Only the token's sha256 is stored, so the plaintext is shown once; regenerate if it is lost.

An agent token reads and writes that one account's applications and nothing else — `requireSessionUser` keeps it away from `/api/me`, so it can never change a password or mint another token. `docs/AGENT.md` lists the endpoints and has a prompt to paste into the task; Settings → Automations shows the same prompt with your base URL already filled in.

## How the pieces behave

**Status changes log themselves.** Moving a card, changing the status in the table, or picking a status in the drawer appends `{ date, label: "Status: <name>" }` to the row's `events`. Moving to Applied also fills `appliedDate` if it is blank. The stats strip (active, applied, response rate, median days to first response) is derived from those events, not from counters.

**Moving backwards undoes progress.** Dropping a row back to Applied clears the response recorded above it, so a mis-click on OA (or a process that restarted) no longer counts as a response for good; dropping it back to Interested also clears `appliedDate`, so it stops counting as applied. The timeline keeps every entry either way — only what the stats derive from it changes. Undo on the toast puts the row back exactly as it was.

**Marking a stage complete.** While a row sits in OA, Phone screen, or Onsite, the drawer offers "Mark <stage> complete" (or `c` on the keyboard) — for when the OA is submitted or the interview has happened and the ball is back in their court. It appends `{ date, label: "Completed: <stage>" }`, shows a green *done* badge on the card and table row, and applies to the stage the row is in now: moving on, or coming back to a stage later, starts it fresh.

**Filters.** Search, the "needs attention" toggle, and the status chips sit above the board or table. Tag chips are folded behind the **Tags** toggle at the end of the status row, so a long tag list only appears when you go looking for it; while it is closed the toggle stays highlighted with the number of tags you have selected.

**Needs attention** is true when any of: status is applied / OA / phone screen / onsite and the row has not been touched in more than 14 days; `nextActionDate` is today or past; status is still Interested and the deadline is within 7 days. The header shows the count and toggles the filter.

**Optimistic writes.** Edits apply immediately and PATCH in the background. On failure the row rolls back and a small inline error appears on the card or table row for a few seconds.

**Contacts, snooze, timeline entries.** Each application can hold contacts (name, role, email, last touch) and free-text timeline entries for interview notes. Snoozing an application (3d / 1w / 2w in the drawer, or `s` on the keyboard) mutes its attention rules until that date; the digest lists snoozed rows separately.

**Undo.** Deleting, or moving to another status, shows a toast with Undo. A delete is only sent to the server after the undo window closes.

**Calendar.** `/api/agent/calendar?token=<your agent token>` is an iCalendar feed of deadlines and next actions; subscribe to it from Google or Apple Calendar. It is the only endpoint that accepts the token in the query string, because calendar apps cannot send headers — everything else requires the `Authorization` header, since query strings end up in logs.

**Keyboard.** Press `?` in the app for the list: `n` new, `/` search, `j`/`k` move, `↵` open, `1`–`9` set status, `c` mark the current stage complete, `s` snooze a week, `v` switch view. The number keys follow *your* visible lanes in *your* order, and the help sheet lists them by the names you gave them.

**Board on phones.** Below 768px the board collapses to the table automatically; the board/table toggle (stored in `localStorage`) only applies on wider screens.

### Sync from Claude

1. **Copy context** (header, or inside the Sync modal) puts a compact JSON array of `{ company, role, url, status }` on the clipboard. No notes, compensation, or referral names leave the app.
2. The Sync modal's collapsible panel holds the prompt to run in Claude, with a copy button. Fill in the bracketed parts.
3. Paste Claude's JSON array into the textarea and press **Preview changes**. Parsing is lenient: only `company` and `role` are required, statuses are lowercased and unknown ones become `interested`, dates may be `YYYY-MM-DD` or ISO, markdown fences are tolerated. Rows that still fail are listed with their errors and skipped; the rest proceed.
4. Each row is matched against existing applications by normalized URL first (host, path, tracking parameters stripped), then by fuzzy company + role (lowercased, punctuation and Inc./LLC removed, Senior / New Grad / year tokens ignored).
5. The preview shows new rows, updated rows with field-level before → after, and unchanged rows. Imported values refresh posting metadata (location, work model, URL, source, deadline, compensation) and fill blanks elsewhere. `notes`, `status`, and `events` are never overwritten: a proposed status change is shown with a checkbox that is off by default, and the bulk endpoint applies `notes` with `COALESCE` so it can only fill an empty field.
6. **Apply** sends one request to `/api/applications/bulk`, which runs in a single transaction. If anything fails, nothing is written.
