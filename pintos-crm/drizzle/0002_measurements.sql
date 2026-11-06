CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" text NOT NULL,
	"property_record_id" text,
	"surface" text NOT NULL,
	"sqft" integer NOT NULL,
	"living_sqft" integer,
	"footprint_sqft" integer,
	"perimeter_ft" integer,
	"pitch" integer,
	"stories" integer,
	"used_solar" boolean DEFAULT false NOT NULL,
	"method" text NOT NULL,
	"points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"staff_id" uuid,
	"staff_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ghl_synced_at" timestamp with time zone,
	"ghl_error" text
);
--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "measurements_contact_idx" ON "measurements" USING btree ("contact_id","created_at");