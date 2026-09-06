ALTER TABLE "applications" ADD COLUMN "contacts" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "snoozed_until" date;