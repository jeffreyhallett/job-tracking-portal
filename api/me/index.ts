import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq } from "drizzle-orm";
import { applications, users, type UserRow } from "../../db/schema.js";
import { agentTokenPrefix, generateAgentToken, hashAgentToken, hashPassword, verifyPassword } from "../../shared/crypto.js";
import { passwordProblem } from "../../shared/password.js";
import { normalizePrefs, resolveUserStages, type UserPrefs } from "../../shared/prefs.js";
import { accountActionSchema, profilePatchSchema } from "../../shared/schemas.js";
import type { StageSet } from "../../shared/stages.js";
import { retargetEvents } from "../../shared/timeline.js";
import type { ChangePasswordResponse, PublicUser, RotateAgentTokenResponse } from "../../shared/user.js";
import type { Db, Tx } from "../_db.js";
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
    const user = await requireSessionUser(req, res, db);

    if (req.method === "GET") {
      res.status(200).json(await reload(db, user.id));
      return;
    }

    if (req.method === "PATCH") {
      const patch = parseBody(req, profilePatchSchema);
      const prefs = patch.prefs === undefined ? undefined : normalizePrefs(patch.prefs);

      // Submitted a pipeline that nothing survived? Say so rather than saving
      // silently without it.
      if (patch.prefs?.stages && !prefs?.stages) {
        throw new HttpError(400, "That pipeline is not usable: give every stage a name, and keep at least one visible stage that is not Closed.");
      }

      const before = resolveUserStages(user.prefs);
      const after = prefs?.stages ? resolveUserStages(prefs) : before;
      const moves = patch.reassignStages ?? [];
      for (const { from, to } of moves) {
        if (after.has(from)) throw new HttpError(400, `Cannot move applications off "${from}": it is still in the pipeline`);
        if (!after.has(to)) throw new HttpError(400, `Cannot move applications to "${to}": it is not in the new pipeline`);
      }

      // One transaction: the applications land on stages that exist by the time
      // the new pipeline is the one being read.
      const row = await db.transaction(async (tx) => {
        for (const { from, to } of moves) await reassignStage(tx, user.id, from, to, before, after);
        const [updated] = await tx
          .update(users)
          .set({
            ...(patch.name !== undefined ? { name: patch.name?.trim() || null } : {}),
            ...(prefs !== undefined ? { prefs: mergePrefs(user.prefs, prefs, patch.prefs) } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
        return updated;
      });
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
 * Keep the halves of `prefs` the request did not mention, so a PATCH that only
 * changes the columns cannot wipe the pipeline (or the other way round).
 */
function mergePrefs(existing: UserPrefs, normalized: UserPrefs, submitted: { stages?: unknown; columns?: unknown } | undefined): UserPrefs {
  const merged: UserPrefs = {};
  const stages = submitted?.stages ? normalized.stages : existing.stages;
  const columns = submitted?.columns ? normalized.columns : existing.columns;
  if (stages) merged.stages = stages;
  if (columns) merged.columns = columns;
  // The version describes the pipeline, so it travels with whichever one is kept.
  // A columns-only PATCH leaves an un-upgraded pipeline un-stamped, which is the
  // point: it keeps being upgraded on read until the editor saves it for real.
  const v = submitted?.stages ? normalized.v : existing.v;
  if (v !== undefined) merged.v = v;
  // Legacy lane prefs survive until a real pipeline replaces them.
  if (!stages && existing.lanes) merged.lanes = existing.lanes;
  return merged;
}

/**
 * Move every application in `from` to `to`, and rewrite the timeline entries
 * that mention `from` so the history moves with them.
 *
 * Reads the owner's rows rather than trying to express "an events array
 * containing this stage" in SQL: entries written before events carried stage ids
 * are only recognisable by their label, and this runs at most once per pipeline
 * edit over one person's applications.
 *
 * `updatedAt` is deliberately left alone. This is bookkeeping, not activity, and
 * bumping it would clear the stale flag on everything it touched.
 */
async function reassignStage(tx: Tx, ownerId: string, from: string, to: string, before: StageSet, after: StageSet): Promise<void> {
  const rows = await tx
    .select({ id: applications.id, status: applications.status, events: applications.events })
    .from(applications)
    .where(eq(applications.ownerId, ownerId));

  for (const row of rows) {
    const events = retargetEvents(row.events ?? [], from, to, before, after);
    const movesStage = row.status === from;
    const movesEvents = events.some((e, i) => e !== (row.events ?? [])[i]);
    if (!movesStage && !movesEvents) continue;
    await tx
      .update(applications)
      .set({ ...(movesStage ? { status: to } : {}), ...(movesEvents ? { events } : {}) })
      .where(and(eq(applications.id, row.id), eq(applications.ownerId, ownerId)));
  }
}

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
