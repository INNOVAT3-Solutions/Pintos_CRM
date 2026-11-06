"use server";

/**
 * Actions the HOMEOWNER triggers from their estimate page. No login: the
 * estimate's secret token is the only key, so every action re-loads the
 * estimate by token, only allows choices the business offered, and recomputes
 * every price on the server.
 */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import type { EstimateChoice, PlanItem } from "@/lib/db/schema";
import { addNote } from "@/lib/ghl/api";
import { money } from "@/lib/format";
import { totals } from "./pricing";
import { pushAcceptedToGhl } from "./server";
import { createJobsForAcceptedEstimate } from "@/lib/jobs/server";

export interface PublicResult {
  ok?: boolean;
  error?: string;
}

const token = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);

const acceptSchema = z.object({
  token,
  joinedPlan: z.boolean(),
  /** Indexes into the estimate's offered plan items, each with the chosen frequency. */
  items: z
    .array(z.object({ index: z.number().int().min(0).max(50), frequency: z.enum(["monthly", "bimonthly", "quarterly", "semiannual", "annual"]) }))
    .max(20),
  signedName: z.string().trim().min(2, "Type your full name to accept").max(120),
});

// Light abuse protection for a public endpoint.
const hits = new Map<string, { n: number; at: number }>();
function tooMany(key: string) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.at > 60_000) {
    hits.set(key, { n: 1, at: now });
    return false;
  }
  h.n++;
  return h.n > 10;
}

async function load(t: string) {
  const db = await getDb();
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.publicToken, t));
  return est ?? null;
}

const expired = (sentAt: Date | null, validDays: number) =>
  !!sentAt && Date.now() > sentAt.getTime() + validDays * 86_400_000;

export async function acceptEstimate(input: z.infer<typeof acceptSchema>): Promise<PublicResult> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Something's missing." };
  const v = parsed.data;
  if (tooMany(v.token)) return { error: "Too many attempts. Please wait a minute." };

  const est = await load(v.token);
  if (!est || est.status === "draft") return { error: "This estimate isn't available." };
  if (est.status === "accepted") return { ok: true }; // already done; idempotent
  if (est.status === "declined") return { error: "This estimate was declined. Contact us for a new one." };
  if (expired(est.sentAt, est.validDays)) return { error: "This estimate has expired. Contact us for an updated one." };

  // Plan choices must come from what was offered, at frequencies the business allows.
  let chosen: PlanItem[] = [];
  if (v.joinedPlan) {
    if (!est.planOffered) return { error: "A plan wasn't offered on this estimate." };
    const seen = new Set<number>();
    for (const c of v.items) {
      const offered = est.planItems[c.index];
      if (!offered || seen.has(c.index)) return { error: "That plan choice isn't available." };
      if (!est.terms.frequencies.includes(c.frequency)) return { error: "That visit frequency isn't available." };
      seen.add(c.index);
      chosen.push({ ...offered, frequency: c.frequency });
    }
    if (!chosen.length) return { error: "Pick at least one service for your plan, or choose one-time." };
  } else {
    chosen = [];
  }

  const t = totals(est.lines, chosen.length ? chosen : null, est.terms);
  const choice: EstimateChoice = {
    joinedPlan: !!t.plan,
    items: chosen.map((i) => ({ serviceId: i.serviceId, name: i.name, frequency: i.frequency })),
    signedName: v.signedName,
    todayTotal: t.today,
    discountPct: t.discountPct,
    planAnnual: t.plan?.annual ?? 0,
    billingMonths: t.plan?.billingMonths ?? 0,
    billingAmount: t.plan?.billingAmount ?? 0,
  };

  const db = await getDb();
  // Record the acceptance first — it's the customer's decision, whatever happens with GHL.
  const [row] = await db
    .update(schema.estimates)
    .set({ status: "accepted", choice, decidedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.estimates.id, est.id))
    .returning();
  await db.insert(schema.activity).values({
    staffName: `${v.signedName} (customer)`,
    action: "estimate.accept",
    contactId: est.contactId,
    summary: `Accepted estimate #${est.number}: ${money(t.today)} today${t.plan ? `, joined plan at ${money(t.plan.billingAmount)} every ${t.plan.billingMonths} months` : " (one-time)"}`,
  });

  await pushAcceptedToGhl(row, choice);
  // The work they bought becomes a job to schedule (+ the first plan visit if they joined).
  await createJobsForAcceptedEstimate(row, choice);
  revalidatePath("/jobs");
  revalidatePath(`/estimates/${est.id}`);
  revalidatePath(`/customers/${est.contactId}`);
  return { ok: true };
}

const declineSchema = z.object({ token, reason: z.string().trim().max(1000) });

export async function declineEstimate(input: z.infer<typeof declineSchema>): Promise<PublicResult> {
  const parsed = declineSchema.safeParse(input);
  if (!parsed.success) return { error: "Something went wrong." };
  if (tooMany(parsed.data.token)) return { error: "Too many attempts. Please wait a minute." };
  const est = await load(parsed.data.token);
  if (!est || est.status === "draft") return { error: "This estimate isn't available." };
  if (est.status === "accepted" || est.status === "declined") return { error: `This estimate was already ${est.status}.` };

  const db = await getDb();
  await db.update(schema.estimates).set({ status: "declined", decidedAt: new Date(), updatedAt: new Date() }).where(eq(schema.estimates.id, est.id));
  await db.insert(schema.activity).values({
    staffName: "Customer",
    action: "estimate.decline",
    contactId: est.contactId,
    summary: `Declined estimate #${est.number}${parsed.data.reason ? `: “${parsed.data.reason}”` : ""}`,
  });
  try {
    await addNote(est.contactId, `Estimate #${est.number} declined by the customer online.${parsed.data.reason ? `\nReason: ${parsed.data.reason}` : ""}`);
  } catch {
    /* the decline is recorded in the CRM even if GHL is unreachable */
  }
  revalidatePath(`/estimates/${est.id}`);
  return { ok: true };
}
