import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { UserPrefs } from "../shared/prefs.js";
import type { ApplicationEvent, Contact } from "../shared/types.js";

/**
 * One row per person with an account. Accounts are created out of band with
 * `npm run user:add`; there is no self-service sign-up.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /** Always stored lowercase (see normalizeEmail); the unique index is the guard. */
    email: text("email").notNull(),
    name: text("name"),
    /** `scrypt$N$r$p$salt$hash`. Doubles as the session-token signing key. */
    passwordHash: text("password_hash").notNull(),
    /** Set on accounts created by an admin; the app forces a change at sign-in. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    /** sha256 of the agent token. The plaintext is never stored. */
    agentTokenHash: text("agent_token_hash"),
    /** First few characters, so the UI can show which token is live. */
    agentTokenPrefix: text("agent_token_prefix"),
    agentTokenCreatedAt: timestamp("agent_token_created_at", { withTimezone: true, mode: "date" }),
    /** Lane names/order and table columns; see shared/prefs.ts. */
    prefs: jsonb("prefs").$type<UserPrefs>().notNull().default(sql`'{}'::jsonb`),
    /** Sign-in throttle; reset on every success. */
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_agent_token_idx").on(t.agentTokenHash),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /**
     * users.id as text. Left as text rather than a uuid FK so the pre-multi-user
     * rows (owner_id 'jeffrey', 'default') stay readable until `npm run
     * user:claim` reassigns them; see README.
     */
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
    contacts: jsonb("contacts").$type<Contact[]>().default(sql`'[]'::jsonb`),
    snoozedUntil: date("snoozed_until", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => [
    index("applications_owner_status_idx").on(t.ownerId, t.status),
    index("applications_owner_updated_idx").on(t.ownerId, t.updatedAt),
    // Stages are per-user data now (shared/stages.ts), so this can only police
    // the shape of an id. Membership of the owner's pipeline is checked in the
    // handlers, which are the only thing that knows whose row this is.
    check("applications_status_check", sql`${t.status} ~ '^[a-z0-9][a-z0-9_]{0,39}$'`),
    check("applications_work_model_check", sql`${t.workModel} is null or ${t.workModel} in ('onsite', 'hybrid', 'remote')`),
  ],
);

export type ApplicationRow = typeof applications.$inferSelect;
export type NewApplicationRow = typeof applications.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
