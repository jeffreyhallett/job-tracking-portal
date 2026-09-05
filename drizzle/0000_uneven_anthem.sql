CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"location" text,
	"work_model" text,
	"url" text,
	"source" text,
	"status" text DEFAULT 'interested' NOT NULL,
	"applied_date" date,
	"deadline" date,
	"compensation" text,
	"referral" text,
	"resume_version" text,
	"notes" text,
	"next_action" text,
	"next_action_date" date,
	"tags" text[] DEFAULT '{}'::text[],
	"events" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "applications_status_check" CHECK ("applications"."status" in ('interested', 'applied', 'oa', 'phone_screen', 'onsite', 'offer', 'rejected', 'ghosted', 'withdrawn')),
	CONSTRAINT "applications_work_model_check" CHECK ("applications"."work_model" is null or "applications"."work_model" in ('onsite', 'hybrid', 'remote'))
);
--> statement-breakpoint
CREATE INDEX "applications_owner_status_idx" ON "applications" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "applications_owner_updated_idx" ON "applications" USING btree ("owner_id","updated_at");