import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import { users, type UserRow } from "../../db/schema.js";
import { agentTokenPrefix, generateAgentToken, hashAgentToken, hashPassword, verifyPassword } from "../../shared/crypto.js";
import { passwordProblem } from "../../shared/password.js";
import { normalizePrefs } from "../../shared/prefs.js";
import { accountActionSchema, profilePatchSchema } from "../../shared/schemas.js";
import type { ChangePasswordResponse, PublicUser, RotateAgentTokenResponse } from "../../shared/user.js";
import type { Db } from "../_db.js";
import { openDb } from "../_db.js";
import { HttpError } from "../_error.js";
import { parseBody, route } from "../_http.js";
import { issueSessionToken, requireSessionUser } from "../_owner.js";
import { publicUser } from "../_user.js";

/**
 * The signed-in user's own account.
 *
 *   GET    /api/me                      -> profile + preferences
 *   PATCH  /api/me  { name?, prefs? }   -> rename, or save lanes / columns
 *   POST   /api/me  { action, ... }     -> changePassword | rotateAgentToken
 *                                          | revokeAgentToken | resetPrefs
 *
 * Every branch needs a real session (requireSessionUser), so an agent token can
 * never reach the credentials that would let it extend its own access.
 */
export default route(async (req: VercelRequest, res: VercelResponse) => {
  const { db, close } = openDb();
  try {
    const user = await requireSessionUser(req, db);

    if (req.method === "GET") {
      res.status(200).json(await reload(db, user.id));
      return;
    }

    if (req.method === "PATCH") {
      const patch = parseBody(req, profilePatchSchema);
      const [row] = await db
        .update(users)
        .set({
          ...(patch.name !== undefined ? { name: patch.name?.trim() || null } : {}),
          ...(patch.prefs !== undefined ? { prefs: normalizePrefs(patch.prefs) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();
      if (!row) throw new HttpError(404, "Account not found");
      res.status(200).json(publicUser(row));
      return;
    }

    if (req.method === "POST") {
      const body = parseBody(req, accountActionSchema);
      switch (body.action) {
        case "changePassword":
          res.status(200).json(await changePassword(db, user.id, body.currentPassword, body.newPassword));
          return;
        case "rotateAgentToken":
          res.status(200).json(await rotateAgentToken(db, user.id));
          return;
        case "revokeAgentToken":
          res.status(200).json(await setAgentToken(db, user.id, null));
          return;
        case "resetPrefs": {
          const [row] = await db.update(users).set({ prefs: {}, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
          if (!row) throw new HttpError(404, "Account not found");
          res.status(200).json(publicUser(row));
          return;
        }
      }
    }

    res.setHeader("Allow", "GET, PATCH, POST");
    throw new HttpError(405, "Method not allowed");
  } finally {
    await close();
  }
});

/**
 * Changing the password rotates the session-token signing key, which signs
 * every device out. The fresh token in the response keeps *this* device in.
 */
async function changePassword(db: Db, id: string, currentPassword: string | undefined, newPassword: string): Promise<ChangePasswordResponse> {
  const row = await load(db, id);

  // An account still on an admin-set temporary password may skip the current
  // one: the whole point of the forced change is that the user was handed it.
  if (!row.mustChangePassword) {
    if (!currentPassword) throw new HttpError(400, "Enter your current password");
    if (!verifyPassword(currentPassword, row.passwordHash)) throw new HttpError(401, "Current password is wrong");
  }

  const problem = passwordProblem(newPassword);
  if (problem) throw new HttpError(400, problem);
  if (verifyPassword(newPassword, row.passwordHash)) throw new HttpError(400, "That is already your password");

  const [updated] = await db
    .update(users)
    .set({ passwordHash: hashPassword(newPassword), mustChangePassword: false, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  if (!updated) throw new HttpError(404, "Account not found");
  return { user: publicUser(updated), token: issueSessionToken(updated) };
}

/** The plaintext is returned exactly once here; only its sha256 is stored. */
async function rotateAgentToken(db: Db, id: string): Promise<RotateAgentTokenResponse> {
  const token = generateAgentToken();
  return { user: await setAgentToken(db, id, token), token };
}

async function setAgentToken(db: Db, id: string, token: string | null): Promise<PublicUser> {
  const [row] = await db
    .update(users)
    .set({
      agentTokenHash: token ? hashAgentToken(token) : null,
      agentTokenPrefix: token ? agentTokenPrefix(token) : null,
      agentTokenCreatedAt: token ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();
  if (!row) throw new HttpError(404, "Account not found");
  return publicUser(row);
}

async function load(db: Db, id: string): Promise<UserRow> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Account not found");
  return row;
}

async function reload(db: Db, id: string): Promise<PublicUser> {
  return publicUser(await load(db, id));
}
