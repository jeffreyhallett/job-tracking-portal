import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { parseBody, route } from "./_http.js";
import { HttpError, issueToken } from "./_owner.js";

const bodySchema = z.object({ password: z.string().min(1).max(200) });

// POST /api/auth { password } -> { token }
// The only handler that does not go through getOwnerId.
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    throw new HttpError(405, "Method not allowed");
  }
  const { password } = parseBody(req, bodySchema);
  const token = issueToken(password);
  if (!token) {
    await new Promise((r) => setTimeout(r, 400)); // blunt brute-force damper
    throw new HttpError(401, "Wrong password");
  }
  res.status(200).json({ token });
});
