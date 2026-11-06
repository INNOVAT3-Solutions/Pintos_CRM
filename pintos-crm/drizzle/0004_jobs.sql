CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"contact_id" text NOT NULL,
	"estimate_id" uuid,
	"kind" text DEFAULT 'service' NOT NULL,
	"title" text NOT NULL,
	"address" text,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'to_schedule' NOT NULL,
	"due_date" text,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"calendar_id" text,
	"appointment_id" text,
	"assigned_user_id" text,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"plan_visit" jsonb,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ghl_error" text
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_number_idx" ON "jobs" USING btree ("number");--> statement-breakpoint
CREATE INDEX "jobs_contact_idx" ON "jobs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status","scheduled_start");