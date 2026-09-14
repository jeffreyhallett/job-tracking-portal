import { z } from "zod";
import { MAX_LANE_LABEL, TABLE_COLUMNS } from "./prefs.js";
import { STATUSES, WORK_MODELS } from "./types.js";

// Strict schemas used by the API handlers to validate request bodies.
// (The lenient import schema lives client-side in src/lib/import.ts.)

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const eventSchema = z.object({
  date: isoDate,
  label: z.string().min(1).max(500),
  details: z.string().max(20000).optional(),
});

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(320).optional(),
  role: z.string().trim().max(100).optional(),
  lastContact: isoDate.optional(),
});

const optionalText = z.string().max(2000).optional();

export const applicationInputSchema = z.object({
  company: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200),
  location: optionalText,
  workModel: z.enum(WORK_MODELS).optional(),
  url: z.string().max(2000).optional(),
  source: optionalText,
  status: z.enum(STATUSES).default("interested"),
  appliedDate: isoDate.optional(),
  deadline: isoDate.optional(),
  compensation: optionalText,
  referral: optionalText,
  resumeVersion: optionalText,
  notes: z.string().max(20000).optional(),
  nextAction: optionalText,
  nextActionDate: isoDate.optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  events: z.array(eventSchema).max(500).default([]),
  contacts: z.array(contactSchema).max(50).default([]),
  snoozedUntil: isoDate.optional(),
});

// PATCH bodies: every field optional, and a field explicitly set to null
// clears it. Required text fields can't be nulled.
export const applicationPatchSchema = z.object({
  company: z.string().trim().min(1).max(200).optional(),
  role: z.string().trim().min(1).max(200).optional(),
  location: optionalText.nullable(),
  workModel: z.enum(WORK_MODELS).optional().nullable(),
  url: z.string().max(2000).optional().nullable(),
  source: optionalText.nullable(),
  status: z.enum(STATUSES).optional(),
  appliedDate: isoDate.optional().nullable(),
  deadline: isoDate.optional().nullable(),
  compensation: optionalText.nullable(),
  referral: optionalText.nullable(),
  resumeVersion: optionalText.nullable(),
  notes: z.string().max(20000).optional().nullable(),
  nextAction: optionalText.nullable(),
  nextActionDate: isoDate.optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  events: z.array(eventSchema).max(500).optional(),
  contacts: z.array(contactSchema).max(50).optional(),
  snoozedUntil: isoDate.optional().nullable(),
});

export const bulkRequestSchema = z.object({
  creates: z.array(applicationInputSchema).max(500),
  updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        // `notes` in a bulk patch may only fill a blank; the handler applies it
        // with COALESCE so an import can never overwrite existing notes.
        patch: applicationPatchSchema,
      }),
    )
    .max(500),
});

export type ApplicationInputParsed = z.infer<typeof applicationInputSchema>;
export type ApplicationPatchParsed = z.infer<typeof applicationPatchSchema>;

// Preferences. Deliberately loose on `status` / `key`: the bodies are bounded
// here, then normalizePrefs() in shared/prefs.ts drops anything it does not
// recognise, so one schema does not have to be regenerated whenever a lane or
// column is added.
export const userPrefsSchema = z.object({
  lanes: z
    .array(
      z.object({
        status: z.string().max(40),
        label: z.string().max(MAX_LANE_LABEL).optional(),
        hidden: z.boolean().optional(),
      }),
    )
    .max(STATUSES.length * 2)
    .optional(),
  columns: z
    .array(
      z.object({
        key: z.string().max(40),
        hidden: z.boolean().optional(),
      }),
    )
    .max(TABLE_COLUMNS.length * 2)
    .optional(),
});

export const profilePatchSchema = z.object({
  name: z.string().trim().max(120).nullable().optional(),
  prefs: userPrefsSchema.optional(),
});

/**
 * POST /api/me carries an `action` instead of being split into one Vercel
 * function per verb; the deployment has a function budget and these three are
 * rare, small, and all guarded the same way.
 */
export const accountActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("changePassword"),
    // Absent when the account is still on the temporary password an admin set.
    currentPassword: z.string().min(1).max(200).optional(),
    newPassword: z.string().min(1).max(200),
  }),
  z.object({ action: z.literal("rotateAgentToken") }),
  z.object({ action: z.literal("revokeAgentToken") }),
  z.object({ action: z.literal("resetPrefs") }),
]);
