import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true });

export const roleEnum = pgEnum("staff_role", ["admin", "staff"]);

/** People who can sign in to the CRM. Linked to a GHL user once one exists for them. */
export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull().default("staff"),
    passwordHash: text("password_hash").notNull(),
    /** GHL user id, so assignments in the CRM map to the same person in GHL. */
    ghlUserId: text("ghl_user_id"),
    active: boolean("active").notNull().default(true),
    createdAt: tz("created_at").notNull().defaultNow(),
    lastLoginAt: tz("last_login_at"),
  },
  (t) => [uniqueIndex("staff_email_idx").on(t.email)],
);

export type Staff = typeof staff.$inferSelect;

/* ------------------------------------------------------------------------- *
 * Local mirror of GoHighLevel. GHL is the master: these rows are only ever
 * written from GHL API responses (after a sync, or after the CRM writes to
 * GHL and gets the saved record back). Never edit them directly.
 * ------------------------------------------------------------------------- */

/** custom field values keyed by GHL field id. */
export type CustomValues = Record<string, string | number | string[] | null>;

export const ghlContacts = pgTable(
  "ghl_contacts",
  {
    id: text("id").primaryKey(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    /** Display name: "First Last", falling back to company or email. */
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    companyName: text("company_name"),
    address1: text("address1"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    type: text("type"),
    source: text("source"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    assignedTo: text("assigned_to"),
    dnd: boolean("dnd").notNull().default(false),
    custom: jsonb("custom").$type<CustomValues>().notNull().default({}),
    /** Lower-cased name/email/phone/address/company, for fast search. */
    searchText: text("search_text").notNull().default(""),
    dateAdded: tz("date_added"),
    dateUpdated: tz("date_updated"),
    syncedAt: tz("synced_at").notNull().defaultNow(),
  },
  (t) => [index("ghl_contacts_added_idx").on(t.dateAdded)],
);

export type GhlContact = typeof ghlContacts.$inferSelect;

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
}

export const ghlPipelines = pgTable("ghl_pipelines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  stages: jsonb("stages").$type<PipelineStage[]>().notNull().default([]),
  syncedAt: tz("synced_at").notNull().defaultNow(),
});

export type GhlPipeline = typeof ghlPipelines.$inferSelect;

export const ghlOpportunities = pgTable(
  "ghl_opportunities",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    pipelineId: text("pipeline_id").notNull(),
    stageId: text("stage_id").notNull(),
    /** open | won | lost | abandoned */
    status: text("status").notNull(),
    value: doublePrecision("value").notNull().default(0),
    contactId: text("contact_id"),
    assignedTo: text("assigned_to"),
    source: text("source"),
    createdAt: tz("created_at"),
    updatedAt: tz("updated_at"),
    lastStageChangeAt: tz("last_stage_change_at"),
    syncedAt: tz("synced_at").notNull().defaultNow(),
  },
  (t) => [index("ghl_opps_contact_idx").on(t.contactId), index("ghl_opps_stage_idx").on(t.pipelineId, t.stageId)],
);

export type GhlOpportunity = typeof ghlOpportunities.$inferSelect;

export const ghlCustomFields = pgTable("ghl_custom_fields", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Stable key, e.g. "contact.square_footage". The CRM refers to fields by this. */
  fieldKey: text("field_key").notNull(),
  dataType: text("data_type").notNull(),
  model: text("model").notNull(),
  options: jsonb("options").$type<string[]>().notNull().default([]),
  position: integer("position").notNull().default(0),
});

export type GhlCustomField = typeof ghlCustomFields.$inferSelect;

export const ghlUsers = pgTable("ghl_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  role: text("role"),
});

export type GhlUser = typeof ghlUsers.$inferSelect;

/** When each kind of data was last pulled in full from GHL. */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  lastSyncAt: tz("last_sync_at").notNull(),
  lastError: text("last_error"),
});

/**
 * Who did what in the CRM. GHL records every change as "the integration", so
 * this is where you see which staff member made it.
 */
export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").references(() => staff.id),
    staffName: text("staff_name").notNull(),
    /** e.g. contact.update, opportunity.move */
    action: text("action").notNull(),
    contactId: text("contact_id"),
    summary: text("summary").notNull(),
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [index("activity_contact_idx").on(t.contactId, t.at)],
);

export type Activity = typeof activity.$inferSelect;

/* ------------------------------------------------------------------------- *
 * Measurements. The outline (map points) lives only here — GHL has nowhere to
 * keep shapes. The resulting numbers are written to GHL (Property record +
 * contact fields); `ghlSyncedAt`/`ghlError` say whether that worked.
 * ------------------------------------------------------------------------- */

export type Surface = "roof" | "house" | "driveway" | "patio" | "walkway" | "other";
export interface LatLng {
  lat: number;
  lng: number;
}

export const measurements = pgTable(
  "measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: text("contact_id").notNull(),
    /** GHL Properties record this measurement was written to. */
    propertyRecordId: text("property_record_id"),
    surface: text("surface").$type<Surface>().notNull(),
    /** What this area is called on site, e.g. "Back patio", "Pool deck" (several per surface type are allowed). */
    label: text("label"),
    /** The headline number for this surface (sloped roof, wall area, or flat area). */
    sqft: integer("sqft").notNull(),
    /** House only: footprint × stories (goes to GHL "Square Footage"). */
    livingSqft: integer("living_sqft"),
    footprintSqft: integer("footprint_sqft"),
    perimeterFt: integer("perimeter_ft"),
    pitch: integer("pitch"),
    stories: integer("stories"),
    usedSolar: boolean("used_solar").notNull().default(false),
    /** Human-readable how-it-was-measured line. */
    method: text("method").notNull(),
    points: jsonb("points").$type<LatLng[]>().notNull().default([]),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    staffId: uuid("staff_id").references(() => staff.id),
    staffName: text("staff_name").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
    ghlSyncedAt: tz("ghl_synced_at"),
    ghlError: text("ghl_error"),
  },
  (t) => [index("measurements_contact_idx").on(t.contactId, t.createdAt)],
);

export type Measurement = typeof measurements.$inferSelect;

/* ------------------------------------------------------------------------- *
 * Price list, plan settings and estimates.
 * GHL's products hold placeholder flat prices, so the CRM's price list is the
 * master; estimates are written to GHL with every line spelled out.
 * ------------------------------------------------------------------------- */

export type PriceUnit = "sqft" | "linear_ft" | "each" | "flat";

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  unit: text("unit").$type<PriceUnit>().notNull(),
  price: doublePrecision("price").notNull(),
  minPrice: doublePrecision("min_price").notNull().default(0),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  /** Can be put on a maintenance plan. */
  planEligible: boolean("plan_eligible").notNull().default(true),
  /** Measure surface whose latest area pre-fills this service's quantity. */
  measureSurface: text("measure_surface").$type<Surface>(),
  /** Flagged on import for a human to double-check. */
  needsReview: text("needs_review"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export type Service = typeof services.$inferSelect;

/** Small key → JSON settings (e.g. "plans"). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export type Frequency = "monthly" | "bimonthly" | "quarterly" | "semiannual" | "annual";

export interface EstimateLine {
  serviceId: string | null;
  name: string;
  unit: PriceUnit;
  qty: number;
  unitPrice: number;
  minPrice: number;
  description: string;
}

export interface PlanItem {
  serviceId: string | null;
  name: string;
  unit: PriceUnit;
  qty: number;
  /** Full one-time price of this service at this property. */
  fullPrice: number;
  /** Price per maintenance visit (defaults to the plan % of fullPrice). */
  perVisit: number;
  frequency: Frequency;
  /** Offered but not pre-selected; the homeowner can opt in. */
  optional: boolean;
}

/** Plan rules frozen onto an estimate when it's sent, so later setting changes don't alter it. */
export interface PlanTerms {
  maintenancePct: number;
  discountPct: number;
  tierEnabled: boolean;
  tierMinAnnual: number;
  tierPct: number;
  minPerBilling: number;
  commitmentMonths: number;
  frequencies: Frequency[];
}

export interface EstimateChoice {
  joinedPlan: boolean;
  items: { serviceId: string | null; name: string; frequency: Frequency }[];
  signedName: string;
  todayTotal: number;
  discountPct: number;
  planAnnual: number;
  billingMonths: number;
  billingAmount: number;
}

export const estimates = pgTable(
  "estimates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull(),
    contactId: text("contact_id").notNull(),
    propertyAddress: text("property_address"),
    /** draft | sent | viewed | accepted | declined */
    status: text("status").notNull().default("draft"),
    /** Secret for the customer's page (/e/<token>). */
    publicToken: text("public_token").notNull(),
    lines: jsonb("lines").$type<EstimateLine[]>().notNull().default([]),
    planOffered: boolean("plan_offered").notNull().default(false),
    planItems: jsonb("plan_items").$type<PlanItem[]>().notNull().default([]),
    terms: jsonb("terms").$type<PlanTerms>().notNull(),
    notes: text("notes").notNull().default(""),
    validDays: integer("valid_days").notNull().default(30),
    choice: jsonb("choice").$type<EstimateChoice>(),
    createdById: uuid("created_by_id").references(() => staff.id),
    createdByName: text("created_by_name").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
    sentAt: tz("sent_at"),
    viewedAt: tz("viewed_at"),
    decidedAt: tz("decided_at"),
    ghlEstimateId: text("ghl_estimate_id"),
    ghlScheduleId: text("ghl_schedule_id"),
    opportunityId: text("opportunity_id"),
    /** Problems writing the accepted estimate to GHL (shown to staff). */
    ghlError: text("ghl_error"),
  },
  (t) => [
    uniqueIndex("estimates_number_idx").on(t.number),
    uniqueIndex("estimates_token_idx").on(t.publicToken),
    index("estimates_contact_idx").on(t.contactId, t.createdAt),
  ],
);

export type Estimate = typeof estimates.$inferSelect;

/* ------------------------------------------------------------------------- *
 * Jobs. The work itself lives here (services, checklist, status); WHEN it
 * happens lives in GHL as a calendar appointment (appointmentId), so GHL's
 * calendar stays the master schedule.
 * ------------------------------------------------------------------------- */

/** to_schedule | scheduled | in_progress | completed | cancelled */
export type JobStatus = "to_schedule" | "scheduled" | "in_progress" | "completed" | "cancelled";

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull(),
    contactId: text("contact_id").notNull(),
    estimateId: uuid("estimate_id").references(() => estimates.id),
    /** service = the job an estimate sold; plan_visit = a maintenance-plan visit. */
    kind: text("kind").$type<"service" | "plan_visit">().notNull().default("service"),
    title: text("title").notNull(),
    address: text("address"),
    /** What's done on this job (copied, so later price changes don't alter it). */
    services: jsonb("services").$type<{ name: string; detail: string }[]>().notNull().default([]),
    /** Amount billed for this job (0 for plan visits — the plan bill covers them). */
    amount: doublePrecision("amount").notNull().default(0),
    status: text("status").$type<JobStatus>().notNull().default("to_schedule"),
    /** Plan visits: the month they're due. */
    dueDate: text("due_date"),
    scheduledStart: tz("scheduled_start"),
    scheduledEnd: tz("scheduled_end"),
    calendarId: text("calendar_id"),
    appointmentId: text("appointment_id"),
    /** GHL user assigned (appointments can only be assigned to GHL users). */
    assignedUserId: text("assigned_user_id"),
    checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    /** Plan visits: which visit in the plan year (1, 2, …) and the plan's billing cadence. */
    planVisit: jsonb("plan_visit").$type<PlanVisitInfo>(),
    completedAt: tz("completed_at"),
    completedBy: text("completed_by"),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
    ghlError: text("ghl_error"),
  },
  (t) => [
    uniqueIndex("jobs_number_idx").on(t.number),
    index("jobs_contact_idx").on(t.contactId),
    index("jobs_status_idx").on(t.status, t.scheduledStart),
  ],
);

export type Job = typeof jobs.$inferSelect;

/** Where a plan visit sits in its plan: month N after the plan started (YYYY-MM-DD). */
export interface PlanVisitInfo {
  month: number;
  start: string;
  billingMonths: number;
  items: { name: string; frequency: Frequency }[];
}

/* ------------------------------------------------------------------------- *
 * Expenses (GHL has nowhere to keep business costs). Revenue comes from
 * completed jobs (CRM) and GHL payments/invoices.
 * ------------------------------------------------------------------------- */

export const EXPENSE_CATEGORIES = ["Supplies & chemicals", "Fuel", "Equipment", "Labor", "Insurance", "Marketing", "Software", "Other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** YYYY-MM-DD (Miami). */
    date: text("date").notNull(),
    vendor: text("vendor").notNull(),
    category: text("category").$type<ExpenseCategory>().notNull(),
    amount: doublePrecision("amount").notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    staffId: uuid("staff_id").references(() => staff.id),
    staffName: text("staff_name").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("expenses_date_idx").on(t.date)],
);

export type Expense = typeof expenses.$inferSelect;
