import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users, type UserRow } from "../db/schema.js";
import { normalizeEmail, verifyPassword } from "../shared/crypto.js";
import type { AuthResponse } from "../shared/user.js";
import { openDb } from "./_db.js";
import { HttpError } from "./_error.js";
import { parseBody, route } from "./_http.js";
import { issueSessionToken } from "./_owner.js";
import { publicUser } from "./_user.js";

const bodySchema = z.object({
  email: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(200),
});

/**
 * Sign-in throttle. Wrong guesses are counted on the user row and a short lock
 * kicks in once they pile up, because serverless functions have no shared
 * memory to rate-limit in. The delay below is the first line of defence.
 */
const LOCK_AFTER_ATTEMPTS = 8;
const LOCK_MINUTES = 15;
const WRONG_PASSWORD_DELAY_MS = 400;

// POST /api/auth { email, password } -> { token, user }
// The only handler that does not go through requireUser.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    throw new HttpError(405, "Method not allowed");
  }
  const body = parseBody(req, bodySchema);
  const email = normalizeEmail(body.email);

  const { db, close } = openDb();
  try {
    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // Same delay and message whether the account exists or the password is
    // wrong, so the response cannot be used to enumerate accounts.
    if (!row) throw await wrongCredentials();

    if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.max(1, Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60_000));
      throw new HttpError(429, `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }

    if (!verifyPassword(body.password, row.passwordHash)) {
      await recordFailure(db, row);
      throw await wrongCredentials();
    }

    await db.update(users).set({ failedAttempts: 0, lockedUntil: null, lastSeenAt: new Date() }).where(eq(users.id, row.id));
    const response: AuthResponse = { token: issueSessionToken(row), user: publicUser(row) };
    res.status(200).json(response);
  } finally {
    await close();
  }
});

async function wrongCredentials(): Promise<HttpError> {
  await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS));
  return new HttpError(401, "Wrong email or password");
}

async function recordFailure(db: ReturnType<typeof openDb>["db"], row: UserRow): Promise<void> {
  const failedAttempts = row.failedAttempts + 1;
  await db
    .update(users)
    .set({
      failedAttempts,
      ...(failedAttempts >= LOCK_AFTER_ATTEMPTS ? { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedAttempts: 0 } : {}),
    })
    .where(eq(users.id, row.id));
}
