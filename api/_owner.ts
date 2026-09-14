import type { VercelRequest } from "@vercel/node";
import { eq } from "drizzle-orm";
import { users, type UserRow } from "../db/schema.js";
import { hashAgentToken, looksLikeAgentToken, parseSessionToken, safeEqual, sessionExpired, sessionMac, sessionToken } from "../shared/crypto.js";
import type { UserPrefs } from "../shared/prefs.js";
import type { Db } from "./_db.js";
import "./_env.js";
import { HttpError } from "./_error.js";
import { queryParam } from "./_http.js";

export { HttpError };

/**
 * THE multi-user seam.
 *
 * Every handler resolves the caller through requireUser() and scopes every
 * query by `user.id`. Nothing else in /api knows how a request is
 * authenticated, and nothing else may read a row without that scope.
 *
 * Two kinds of credential, both sent as `Authorization: Bearer <token>`:
 *
 *  - A session token (`jts1.…`), issued by POST /api/auth in exchange for the
 *    user's email and password. It is a MAC over (user id, issued-at) keyed on
 *    that user's own password hash plus the optional AUTH_SECRET, so there is
 *    no session table and changing a password signs every device out.
 *
 *  - An agent token (`jta_…`), minted per user from Settings → Automations, for
 *    scheduled Claude tasks and scripts (docs/AGENT.md). Only its sha256 is
 *    stored. It reads and writes that one user's applications and nothing else:
 *    requireSessionUser() keeps it away from the account endpoints, so an agent
 *    token can never change a password or mint another token.
 *
 * Accounts are created out of band (`npm run user:add`). There is no
 * self-service sign-up route to reason about.
 */
export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  mustChangePassword: boolean;
  prefs: UserPrefs;
  /** Which credential authenticated this request. */
  via: "session" | "agent";
};

type RequireOptions = {
  /**
   * Also accept `?token=<agent token>`. Only the calendar feed sets this:
   * calendar apps cannot send headers, and query strings end up in logs.
   */
  allowQueryToken?: boolean;
};

export async function requireUser(req: VercelRequest, db: Db, opts: RequireOptions = {}): Promise<AuthUser> {
  const token = bearerToken(req) || (opts.allowQueryToken ? (queryParam(req, "token") ?? "") : "");
  if (!token) throw new HttpError(401, "Unauthorized");
  rejectLegacyAgentToken(token);

  const row = looksLikeAgentToken(token) ? await userByAgentToken(db, token) : await userBySessionToken(db, token);
  if (!row) throw new HttpError(401, "Unauthorized");
  await touchLastSeen(db, row);
  return toAuthUser(row, looksLikeAgentToken(token) ? "agent" : "session");
}

/**
 * Same, but only a real sign-in counts. Used by the account endpoints, so an
 * agent token cannot change the password that would revoke it, rotate itself,
 * or rewrite the owner's preferences.
 */
export async function requireSessionUser(req: VercelRequest, db: Db): Promise<AuthUser> {
  const user = await requireUser(req, db);
  if (user.via !== "session") throw new HttpError(403, "This endpoint needs a signed-in session, not an agent token");
  return user;
}

function toAuthUser(row: UserRow, via: AuthUser["via"]): AuthUser {
  return {
    id: row.id,
    email: row.email,
    ...(row.name ? { name: row.name } : {}),
    mustChangePassword: row.mustChangePassword,
    prefs: row.prefs ?? {},
    via,
  };
}

function bearerToken(req: VercelRequest): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

async function userByAgentToken(db: Db, token: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.agentTokenHash, hashAgentToken(token))).limit(1);
  return row;
}

async function userBySessionToken(db: Db, token: string): Promise<UserRow | undefined> {
  const parsed = parseSessionToken(token);
  if (!parsed || sessionExpired(parsed.issuedAt)) return undefined;
  // A malformed uuid would make Postgres raise rather than return no rows.
  if (!/^[0-9a-f-]{36}$/i.test(parsed.userId)) return undefined;
  const [row] = await db.select().from(users).where(eq(users.id, parsed.userId)).limit(1);
  if (!row) return undefined;
  return safeEqual(parsed.mac, sessionMac(row.id, parsed.issuedAt, row.passwordHash, authSecret())) ? row : undefined;
}

/**
 * The pre-multi-user shared agent token. Answering with a specific message
 * beats a bare 401 when a scheduled task that used to work suddenly stops.
 */
function rejectLegacyAgentToken(token: string): void {
  const legacy = process.env.AGENT_TOKEN;
  if (legacy && legacy.length >= 16 && safeEqual(token, legacy)) {
    throw new HttpError(401, "AGENT_TOKEN is no longer supported. Mint a per-user token under Settings -> Automations and update the task (docs/AGENT.md).");
  }
}

/** Mixed into the session MAC so a read-only database leak cannot mint sessions. */
export function authSecret(): string {
  return process.env.AUTH_SECRET ?? "";
}

export function issueSessionToken(row: UserRow): string {
  return sessionToken(row.id, row.passwordHash, authSecret());
}

const LAST_SEEN_STALE_MS = 6 * 60 * 60 * 1000;

async function touchLastSeen(db: Db, row: UserRow): Promise<void> {
  const seen = row.lastSeenAt?.getTime() ?? 0;
  if (Date.now() - seen < LAST_SEEN_STALE_MS) return;
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, row.id));
}
