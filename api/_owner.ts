import type { VercelRequest } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";
import "./_env.js";
import { queryParam } from "./_http.js";

/**
 * THE multi-user seam.
 *
 * Every handler resolves the current owner through this one function and
 * scopes every query by the returned id. Nothing else in /api knows how a
 * request is authenticated.
 *
 * Current scheme: a single shared password (APP_PASSWORD). The client trades
 * it for a bearer token at POST /api/auth and stores the token on the
 * device; every request carries `Authorization: Bearer <token>`. Every valid
 * token maps to the same owner, DEFAULT_OWNER_ID.
 *
 * Agents (a scheduled Claude task, a script) use AGENT_TOKEN instead, as the
 * same bearer header or as `?token=` for clients that can't set headers.
 * It grants exactly the same access as the password; keep it secret.
 *
 * To move to real auth later (Clerk, Auth.js, ...): verify the session or
 * token from `req` here instead, return the user's stable id, and throw
 * HttpError(401) when there isn't one. Delete issueToken/api/auth.ts if the
 * password flow is gone. Nothing else in /api needs to change.
 */
export function getOwnerId(req: VercelRequest): string {
  const header = req.headers.authorization ?? "";
  const fromHeader = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const token = fromHeader || queryParam(req, "token") || "";
  if (!token) throw new HttpError(401, "Unauthorized");

  const agentToken = process.env.AGENT_TOKEN;
  const ok = safeEqual(token, expectedToken()) || (agentToken !== undefined && agentToken.length >= 16 && safeEqual(token, agentToken));
  if (!ok) throw new HttpError(401, "Unauthorized");
  return process.env.DEFAULT_OWNER_ID || "default";
}

/** Exchange the shared password for the bearer token, or null if wrong. */
export function issueToken(password: string): string | null {
  const expected = requirePassword();
  return safeEqual(password, expected) ? expectedToken() : null;
}

function requirePassword(): string {
  const password = process.env.APP_PASSWORD;
  if (!password) throw new HttpError(500, "APP_PASSWORD is not set on the server");
  return password;
}

// The token is derived from the password, so changing APP_PASSWORD signs
// every device out. No session table needed.
function expectedToken(): string {
  return createHmac("sha256", requirePassword()).update("job-tracker-session-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
