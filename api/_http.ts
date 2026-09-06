import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ZodType } from "zod";
import type { ApplicationRow } from "../db/schema.js";
import type { Application, WorkModel } from "../shared/types.js";
import { isStatus } from "../shared/types.js";
import { HttpError } from "./_owner.js";

/** Wraps a handler with uniform error handling. */
export function route(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  };
}

export function parseBody<T>(req: VercelRequest, schema: ZodType<T>): T {
  const raw: unknown = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(400, `Invalid body: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return result.data;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Body is not valid JSON");
  }
}

/**
 * Parse the request URL with the WHATWG API. Vercel's `req.query` is a lazy
 * getter backed by the deprecated `url.parse()`, which logs DEP0169 on every
 * access under Node 24; nothing in /api reads `req.query` for that reason.
 */
export function requestUrl(req: VercelRequest): URL {
  return new URL(req.url ?? "/", "http://localhost");
}

export function queryParam(req: VercelRequest, name: string): string | undefined {
  return requestUrl(req).searchParams.get(name) ?? undefined;
}

/** The application id from `/api/applications/:id[/…]` (falls back to `?id=`). */
export function paramId(req: VercelRequest): string {
  const url = requestUrl(req);
  const fromPath = /\/api\/applications\/([0-9a-f-]{36})(?:\/|$)/i.exec(url.pathname)?.[1];
  const value = fromPath ?? url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new HttpError(400, "Invalid id");
  return value;
}

/** Convert a DB row to the wire shape: nulls dropped, timestamps as ISO. */
export function serialize(row: ApplicationRow): Application {
  const out: Application = {
    id: row.id,
    company: row.company,
    role: row.role,
    status: isStatus(row.status) ? row.status : "interested",
    events: row.events ?? [],
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    updatedAt: (row.updatedAt ?? new Date()).toISOString(),
  };
  if (row.location) out.location = row.location;
  if (row.workModel) out.workModel = row.workModel as WorkModel;
  if (row.url) out.url = row.url;
  if (row.source) out.source = row.source;
  if (row.appliedDate) out.appliedDate = row.appliedDate;
  if (row.deadline) out.deadline = row.deadline;
  if (row.compensation) out.compensation = row.compensation;
  if (row.referral) out.referral = row.referral;
  if (row.resumeVersion) out.resumeVersion = row.resumeVersion;
  if (row.notes) out.notes = row.notes;
  if (row.nextAction) out.nextAction = row.nextAction;
  if (row.nextActionDate) out.nextActionDate = row.nextActionDate;
  if (row.tags && row.tags.length) out.tags = row.tags;
  if (row.contacts && row.contacts.length) out.contacts = row.contacts;
  if (row.snoozedUntil) out.snoozedUntil = row.snoozedUntil;
  return out;
}
