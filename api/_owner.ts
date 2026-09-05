import type { VercelRequest } from "@vercel/node";

/**
 * THE multi-user seam.
 *
 * Every handler resolves the current owner through this one function and
 * scopes every query by the returned id. There is no auth yet: it returns a
 * constant from DEFAULT_OWNER_ID.
 *
 * To add real auth later (Clerk, Auth.js, ...), change ONLY this function:
 * verify the session/token on `req` and return the user's stable id (throw an
 * HttpError(401) if there isn't one). Nothing else in /api needs to change.
 */
export function getOwnerId(req: VercelRequest): string {
  void req; // unused until auth exists
  const owner = process.env.DEFAULT_OWNER_ID;
  if (!owner) throw new HttpError(500, "DEFAULT_OWNER_ID is not set");
  return owner;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
