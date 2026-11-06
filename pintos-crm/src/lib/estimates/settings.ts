import "server-only";
import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import type { PlanTerms, Service } from "@/lib/db/schema";
import { SEED_SERVICES } from "./seed-services";

/* ---------------- Maintenance plan settings ---------------- */

const frequency = z.enum(["monthly", "bimonthly", "quarterly", "semiannual", "annual"]);

export const planSettingsSchema = z.object({
  /** Shown to homeowners, e.g. "Pinto's Care Plan". */
  planName: z.string().trim().min(2).max(60),
  /** Per-visit maintenance price as % of a service's full price. */
  maintenancePct: z.number().min(1).max(100),
  /** Discount on today's service for joining. */
  discountPct: z.number().min(0).max(80),
  /** Optional bigger discount for larger plans. */
  tierEnabled: z.boolean(),
  tierMinAnnual: z.number().min(0).max(1_000_000),
  tierPct: z.number().min(0).max(80),
  /** Each bill is at least this much (0 = no minimum). */
  minPerBilling: z.number().min(0).max(100_000),
  /** Shown in the plan terms. */
  commitmentMonths: z.number().int().min(0).max(60),
  /** Frequencies homeowners can choose. */
  frequencies: z.array(frequency).min(1),
  /** Days an estimate stays valid. */
  validDays: z.number().int().min(1).max(365),
});

export type PlanSettings = z.infer<typeof planSettingsSchema>;

/** Starting values until Nick confirms his numbers (all editable in Settings → Maintenance plans). */
export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  planName: "Pinto's Care Plan",
  maintenancePct: 50,
  discountPct: 15,
  tierEnabled: false,
  tierMinAnnual: 1200,
  tierPct: 20,
  minPerBilling: 0,
  commitmentMonths: 12,
  frequencies: ["monthly", "bimonthly", "quarterly", "semiannual", "annual"],
  validDays: 30,
};

export async function getPlanSettings(): Promise<PlanSettings> {
  const db = await getDb();
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "plans"));
  const parsed = planSettingsSchema.safeParse({ ...DEFAULT_PLAN_SETTINGS, ...((row?.value as object) ?? {}) });
  return parsed.success ? parsed.data : DEFAULT_PLAN_SETTINGS;
}

export async function savePlanSettings(value: PlanSettings, by: string) {
  const db = await getDb();
  await db
    .insert(schema.settings)
    .values({ key: "plans", value, updatedBy: by })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
}

export const termsFrom = (s: PlanSettings): PlanTerms => ({
  maintenancePct: s.maintenancePct,
  discountPct: s.discountPct,
  tierEnabled: s.tierEnabled,
  tierMinAnnual: s.tierMinAnnual,
  tierPct: s.tierPct,
  minPerBilling: s.minPerBilling,
  commitmentMonths: s.commitmentMonths,
  frequencies: s.frequencies,
});

/* ---------------- Price list ---------------- */

/** Load the starting price list the first time it's needed. */
async function ensureSeeded() {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.services);
  if (n > 0) return;
  await db.insert(schema.services).values(SEED_SERVICES);
}

export async function listServices(opts: { activeOnly?: boolean } = {}): Promise<Service[]> {
  await ensureSeeded();
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.services)
    .orderBy(asc(schema.services.sortOrder), asc(schema.services.name));
  return opts.activeOnly ? rows.filter((r) => r.active) : rows;
}
