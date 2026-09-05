import { z } from "zod";
import { STATUSES, WORK_MODELS } from "./types";

// Strict schemas used by the API handlers to validate request bodies.
// (The lenient import schema lives client-side in src/lib/import.ts.)

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const eventSchema = z.object({
  date: isoDate,
  label: z.string().min(1).max(500),
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
