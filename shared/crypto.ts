/**
 * Password hashing and token primitives. Imported by the API handlers and by
 * scripts/users.ts, so it deliberately has NO local imports: the scripts run on
 * plain Node (type stripping), which cannot resolve the `./x.js` specifiers the
 * rest of shared/ uses. Scripts import this file as `../shared/crypto.ts`.
 *
 * The password *rules* live in shared/password.ts instead, so the sign-in
 * screens can reuse them without dragging node:crypto into the browser bundle.
 */
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Passwords: scrypt, with the parameters stored alongside the hash so they can
// be raised later without invalidating the hashes already written.
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384; // 16 MiB at r=8, comfortably under Node's 32 MiB maxmem default
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

/** `scrypt$N$r$p$salt$hash`, salt and hash base64url. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(normalizePassword(password), salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, expected] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P) || !salt || !expected) return false;
  let key: Buffer;
  try {
    key = scryptSync(normalizePassword(password), Buffer.from(salt, "base64url"), Buffer.from(expected, "base64url").length, {
      N,
      r: R,
      p: P,
      // A hash written with heavier parameters must still verify.
      maxmem: 256 * N * R,
    });
  } catch {
    return false;
  }
  return safeEqual(key.toString("base64url"), expected);
}

/** NFKC, so the same password typed on a different keyboard layout still matches. */
function normalizePassword(password: string): string {
  return password.normalize("NFKC");
}

/** Readable temporary password: four groups of four from an unambiguous alphabet. */
export function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const chars = Array.from(randomBytes(16), (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

// ---------------------------------------------------------------------------
// Session tokens. Stateless: a MAC over (userId, issuedAt) keyed on the user's
// own password hash plus the optional server secret. No session table, and
// changing a password invalidates every token that user holds.
// ---------------------------------------------------------------------------

const SESSION_PREFIX = "jts1";

/** A token stops verifying this long after the sign-in (or refresh) that issued it. */
export const SESSION_MAX_AGE_DAYS = 90;

/**
 * Once a token is this old, the next authenticated request reissues it. That is
 * what makes the 90 days slide: a device used at least once every 90 days never
 * reaches the ceiling, while one left idle that long is signed out.
 *
 * Refreshing on a threshold rather than on every request keeps it to about one
 * extra header and one localStorage write per week per device.
 */
export const SESSION_REFRESH_AFTER_DAYS = 7;

export type ParsedSessionToken = { userId: string; issuedAt: number; mac: string };

export function sessionToken(userId: string, passwordHash: string, secret: string, issuedAt: number = nowSeconds()): string {
  return [SESSION_PREFIX, userId, issuedAt, sessionMac(userId, issuedAt, passwordHash, secret)].join(".");
}

/** Split a token without verifying it: the userId is needed to load the hash. */
export function parseSessionToken(token: string): ParsedSessionToken | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== SESSION_PREFIX) return null;
  const [, userId, issuedAt, mac] = parts;
  const seconds = Number(issuedAt);
  if (!userId || !mac || !Number.isInteger(seconds) || seconds <= 0) return null;
  return { userId, issuedAt: seconds, mac };
}

export function sessionMac(userId: string, issuedAt: number, passwordHash: string, secret: string): string {
  return createHmac("sha256", `${passwordHash} ${secret}`).update(`${SESSION_PREFIX} ${userId} ${issuedAt}`).digest("base64url");
}

export function sessionExpired(issuedAt: number, now: number = nowSeconds()): boolean {
  return now - issuedAt > SESSION_MAX_AGE_DAYS * 86_400 || issuedAt > now + 300;
}

/** True when a still-valid token is old enough to be worth reissuing. */
export function sessionNeedsRefresh(issuedAt: number, now: number = nowSeconds()): boolean {
  if (sessionExpired(issuedAt, now)) return false;
  return now - issuedAt > SESSION_REFRESH_AFTER_DAYS * 86_400;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Agent tokens. Only the sha256 is stored, so a database dump does not hand out
// API access; the plaintext is shown once, when it is minted.
// ---------------------------------------------------------------------------

const AGENT_PREFIX = "jta";

export function generateAgentToken(): string {
  return `${AGENT_PREFIX}_${randomBytes(24).toString("hex")}`;
}

export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/** The leading chunk kept in the database so the UI can say which token is live. */
export function agentTokenPrefix(token: string): string {
  return token.trim().slice(0, AGENT_PREFIX.length + 7);
}

export function looksLikeAgentToken(token: string): boolean {
  return token.startsWith(`${AGENT_PREFIX}_`);
}

// ---------------------------------------------------------------------------

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Lowercase and trim, so `Friend@Example.com ` and `friend@example.com` are one account. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function looksLikeEmail(email: string): boolean {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
