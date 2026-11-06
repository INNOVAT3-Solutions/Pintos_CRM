CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid,
	"staff_name" text NOT NULL,
	"action" text NOT NULL,
	"contact_id" text,
	"summary" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ghl_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company_name" text,
	"address1" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"type" text,
	"source" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_to" text,
	"dnd" boolean DEFAULT false NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"date_added" timestamp with time zone,
	"date_updated" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ghl_custom_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"field_key" text NOT NULL,
	"data_type" text NOT NULL,
	"model" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ghl_opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"status" text NOT NULL,
	"value" double precision DEFAULT 0 NOT NULL,
	"contact_id" text,
	"assigned_to" text,
	"source" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"last_stage_change_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ghl_pipelines" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ghl_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"role" text
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"last_sync_at" timestamp with time zone NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_contact_idx" ON "activity" USING btree ("contact_id","at");--> statement-breakpoint
CREATE INDEX "ghl_contacts_added_idx" ON "ghl_contacts" USING btree ("date_added");--> statement-breakpoint
CREATE INDEX "ghl_opps_contact_idx" ON "ghl_opportunities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "ghl_opps_stage_idx" ON "ghl_opportunities" USING btree ("pipeline_id","stage_id");