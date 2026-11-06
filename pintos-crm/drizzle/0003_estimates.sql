CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"contact_id" text NOT NULL,
	"property_address" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"public_token" text NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan_offered" boolean DEFAULT false NOT NULL,
	"plan_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"terms" jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"valid_days" integer DEFAULT 30 NOT NULL,
	"choice" jsonb,
	"created_by_id" uuid,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"ghl_estimate_id" text,
	"ghl_schedule_id" text,
	"opportunity_id" text,
	"ghl_error" text
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"price" double precision NOT NULL,
	"min_price" double precision DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"plan_eligible" boolean DEFAULT true NOT NULL,
	"measure_surface" text,
	"needs_review" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_created_by_id_staff_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "estimates_number_idx" ON "estimates" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "estimates_token_idx" ON "estimates" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "estimates_contact_idx" ON "estimates" USING btree ("contact_id","created_at");