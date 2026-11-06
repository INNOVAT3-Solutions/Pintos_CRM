"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { planSettingsSchema, savePlanSettings } from "./settings";

export interface SettingsResult {
  ok?: string;
  error?: string;
}

export async function updatePlanSettings(input: unknown): Promise<SettingsResult> {
  const me = await requireAdmin();
  const parsed = planSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `${i?.path.join(".") || "Settings"}: ${i?.message ?? "invalid"}` };
  }
  await savePlanSettings(parsed.data, me.name);
  revalidatePath("/settings");
  return { ok: "Plan settings saved. New estimates use them; estimates already sent keep their original terms." };
}

const serviceSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(2, "Name the service").max(80),
  unit: z.enum(["sqft", "linear_ft", "each", "flat"]),
  price: z.number().min(0).max(1_000_000),
  minPrice: z.number().min(0).max(1_000_000),
  description: z.string().max(2000),
  active: z.boolean(),
  planEligible: z.boolean(),
  measureSurface: z.enum(["roof", "house", "driveway", "patio", "walkway", "other"]).nullable(),
  /** Admin confirmed the row is right; clears the import warning. */
  reviewed: z.boolean(),
});

export async function saveService(input: unknown): Promise<SettingsResult> {
  await requireAdmin();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the service." };
  const { id, reviewed, ...v } = parsed.data;
  const db = await getDb();

  // One price-list service per measured surface, so quantities pre-fill unambiguously.
  if (v.measureSurface) {
    await db.update(schema.services).set({ measureSurface: null }).where(eq(schema.services.measureSurface, v.measureSurface));
  }
  if (id) {
    await db
      .update(schema.services)
      .set({ ...v, ...(reviewed ? { needsReview: null } : {}), updatedAt: new Date() })
      .where(eq(schema.services.id, id));
  } else {
    await db.insert(schema.services).values({ ...v, sortOrder: 999 });
  }
  revalidatePath("/settings/services");
  return { ok: `${v.name} saved.` };
}

export async function deleteService(id: string): Promise<SettingsResult> {
  await requireAdmin();
  const db = await getDb();
  // Past estimates keep a copy of each line, so removing a service never changes them.
  await db.delete(schema.services).where(eq(schema.services.id, id));
  revalidatePath("/settings/services");
  return { ok: "Service removed." };
}
