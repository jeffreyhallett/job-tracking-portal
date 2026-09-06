# Job application tracker

Single-page tracker for a new-grad SWE search: every application, its stage, and what has gone stale. Board and table views, shared filters, a "needs attention" count, and a careful import path for JSON that Claude hands back.

Stack: React 19 + TypeScript on Vite, Tailwind 4, Zod, Vercel Functions in `/api`, Neon Postgres through `@neondatabase/serverless` + Drizzle.

## Layout

```
api/                 Vercel Functions (thin CRUD, no business logic)
  _owner.ts          getOwnerId(req): the one place auth lives (password today)
  _env.ts            loads .env.local under `vercel dev`; no-op when deployed
  _db.ts             Neon pool + Drizzle client, one per invocation
  auth.ts            POST: password -> bearer token
  _http.ts           error wrapper, body parsing, row serialization
  applications/
    index.ts         GET (list) / POST (create)
    [id].ts          PATCH (partial update) / DELETE
    bulk.ts          POST: sync merge, single transaction
db/schema.ts         Drizzle table definition (check constraint + indexes)
drizzle/             generated SQL migration, checked in
shared/types.ts      Status union + Application shape, imported by client and API
shared/schemas.ts    Zod schemas the API validates request bodies with
scripts/seed.ts      inserts three sample rows
src/                 the SPA
  lib/attention.ts   the "needs attention" rules
  lib/stats.ts       stats strip, computed from the events timeline
  lib/import.ts      lenient parse, dedupe, diff plan, bulk request
  state/store.ts     useReducer store with optimistic writes + rollback
```

## Setup

### 1. Neon via the Vercel Marketplace

1. Create the Vercel project (import this repo, framework preset Vite).
2. In the project, open **Storage → Create Database → Neon**, accept the defaults, and connect it to the project. This injects `DATABASE_URL` (and a few `PG*` / `POSTGRES_*` aliases) into every environment automatically.
3. Under **Settings → Environment Variables**, add `APP_PASSWORD` (the password the app asks for) for all three environments. Optionally add `DEFAULT_OWNER_ID`; see "Adding auth later".

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
| `APP_PASSWORD` | Shared password the app asks for. Changing it signs every device out. |
| `DEFAULT_OWNER_ID` | Optional. The owner id every row is read and written with until per-user auth exists. Defaults to `default`. |
| `API_PROXY_TARGET` | Optional. Where the Vite dev server proxies `/api` (default `http://localhost:3000`). |

Note on `vercel dev`: it does not read `.env.local` on its own. It uses the variables you assigned to the **Development** environment in the Vercel dashboard (pulled into `.vercel/`). A variable added only to Production is invisible locally. As a convenience the API also loads `.env.local` and `.env` itself when running outside a deployment (`api/_env.ts`), so either place works.

### 3. Migrate and seed

```sh
npm run db:migrate     # applies drizzle/*.sql to the database in DATABASE_URL
npm run db:seed        # InstaLILY, Amazon, Google sample rows (idempotent)
```

Both read `.env.local` (or `.env`) on their own. Schema changes go in `db/schema.ts`, then `npm run db:generate` writes a new migration to commit.

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

`npm run typecheck` runs `tsc --noEmit` across the client, API, schema, and scripts. `npm run build` produces `dist/`.

## Deploy

Push to the connected branch and Vercel builds it: `vite build` for the SPA, and each file under `api/` becomes a function. Nothing else to configure; `vercel.json` only pins the framework and the dev command.

After the first deploy, run the migration and seed against production once from your machine (`vercel env pull` gives you the production `DATABASE_URL` when you pick that environment).

### Access control

The site is public, the data is not. The first visit asks for `APP_PASSWORD`; the client exchanges it at `POST /api/auth` for a bearer token that is derived from the password (HMAC), stores the token in `localStorage`, and sends it on every API call. Every data handler goes through `getOwnerId(req)`, which rejects requests without a valid token with a 401, at which point the client drops the token and shows the password screen again. There is no session table: rotating `APP_PASSWORD` invalidates every device at once.

Limits worth knowing: one password for everyone who uses the app, and a token that lives in the browser's storage on each device. That is fine for a personal tool behind a password; it is not per-user auth.

If you can use it, Vercel's **Deployment Protection** (Settings → Deployment Protection) is an additional layer in front of the whole site, but it is not required.

## Adding auth later

Every row carries `owner_id`, and every handler gets the current owner from `getOwnerId(req)` in `api/_owner.ts`, then scopes its query by it. Today that function checks the shared-password token and returns `DEFAULT_OWNER_ID`. To add Clerk, Auth.js, or anything else: verify the session or token from `req` inside `getOwnerId`, return the user's stable id (or throw `HttpError(401)`), delete `api/auth.ts` and the password gate on the client, and leave the rest of `/api` untouched. Rows already in the table keep the old constant as their owner, so either set `DEFAULT_OWNER_ID` to your new user id or run a one-line `UPDATE applications SET owner_id = ...` after the switch.

## How the pieces behave

**Status changes log themselves.** Moving a card, changing the status in the table, or picking a status in the drawer appends `{ date, label: "Status: <name>" }` to the row's `events`. Moving to Applied also fills `appliedDate` if it is blank. The stats strip (active, applied, response rate, median days to first response) is derived from those events, not from counters.

**Needs attention** is true when any of: status is applied / OA / phone screen / onsite and the row has not been touched in more than 14 days; `nextActionDate` is today or past; status is still Interested and the deadline is within 7 days. The header shows the count and toggles the filter.

**Optimistic writes.** Edits apply immediately and PATCH in the background. On failure the row rolls back and a small inline error appears on the card or table row for a few seconds.

**Board on phones.** Below 768px the board collapses to the table automatically; the board/table toggle (stored in `localStorage`) only applies on wider screens.

### Sync from Claude

1. **Copy context** (header, or inside the Sync modal) puts a compact JSON array of `{ company, role, url, status }` on the clipboard. No notes, compensation, or referral names leave the app.
2. The Sync modal's collapsible panel holds the prompt to run in Claude, with a copy button. Fill in the bracketed parts.
3. Paste Claude's JSON array into the textarea and press **Preview changes**. Parsing is lenient: only `company` and `role` are required, statuses are lowercased and unknown ones become `interested`, dates may be `YYYY-MM-DD` or ISO, markdown fences are tolerated. Rows that still fail are listed with their errors and skipped; the rest proceed.
4. Each row is matched against existing applications by normalized URL first (host, path, tracking parameters stripped), then by fuzzy company + role (lowercased, punctuation and Inc./LLC removed, Senior / New Grad / year tokens ignored).
5. The preview shows new rows, updated rows with field-level before → after, and unchanged rows. Imported values refresh posting metadata (location, work model, URL, source, deadline, compensation) and fill blanks elsewhere. `notes`, `status`, and `events` are never overwritten: a proposed status change is shown with a checkbox that is off by default, and the bulk endpoint applies `notes` with `COALESCE` so it can only fill an empty field.
6. **Apply** sends one request to `/api/applications/bulk`, which runs in a single transaction. If anything fails, nothing is written.
