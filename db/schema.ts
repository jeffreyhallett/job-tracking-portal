import { sql } from "drizzle-orm";
import { check, date, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { STATUSES, type ApplicationEvent } from "../shared/types.js";

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: text("owner_id").notNull(),
    company: text("company").notNull(),
    role: text("role").notNull(),
    location: text("location"),
    workModel: text("work_model"),
    url: text("url"),
    source: text("source"),
    status: text("status").notNull().default("interested"),
    appliedDate: date("applied_date", { mode: "string" }),
    deadline: date("deadline", { mode: "string" }),
    compensation: text("compensation"),
    referral: text("referral"),
    resumeVersion: text("resume_version"),
    notes: text("notes"),
    nextAction: text("next_action"),
    nextActionDate: date("next_action_date", { mode: "string" }),
    tags: text("tags").array().default(sql`'{}'::text[]`),
    events: jsonb("events").$type<ApplicationEvent[]>().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => [
    index("applications_owner_status_idx").on(t.ownerId, t.status),
    index("applications_owner_updated_idx").on(t.ownerId, t.updatedAt),
    check(
      "applications_status_check",
      sql`${t.status} in (${sql.raw(STATUSES.map((s) => `'${s}'`).join(", "))})`,
    ),
    check("applications_work_model_check", sql`${t.workModel} is null or ${t.workModel} in ('onsite', 'hybrid', 'remote')`),
  ],
);

export type ApplicationRow = typeof applications.$inferSelect;
export type NewApplicationRow = typeof applications.$inferInsert;
