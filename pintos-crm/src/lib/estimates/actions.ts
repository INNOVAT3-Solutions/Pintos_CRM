"use server";

import { randomBytes } from "node:crypto";
import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { GhlError } from "@/lib/ghl/client";
import { sendEmail, sendSms } from "@/lib/ghl/conversations";
import { estimateMessage } from "@/lib/messages/templates";
import { addNote } from "@/lib/ghl/api";
import { money } from "@/lib/format";
import { customerLink, measurePrefill, moveDealForEstimate, type MeasurePrefill } from "./server";
import { getPlanSettings, termsFrom } from "./settings";
import { frequencyLabel, subtotal, totals } from "./pricing";

export type { MeasurePrefill };

export interface EstimateResult {
  ok?: string;
  error?: string;
  warning?: string;
  id?: string;
  /** Estimate number, when the save created a new estimate. */
  number?: number;
  link?: string;
}

const errText = (e: unknown) =>
  e instanceof GhlError ? (e.isMissingScope ? "the GHL token is missing a permission (see Settings)" : e.message) : e instanceof Error ? e.message : String(e);

/* ---------------- Save (draft or edit) ---------------- */

const unit = z.enum(["sqft", "linear_ft", "each", "flat"]);
const lineSchema = z.object({
  serviceId: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Every line needs a service name").max(120),
  unit,
  qty: z.number().min(0).max(10_000_000),
  unitPrice: z.number().min(0).max(1_000_000),
  minPrice: z.number().min(0).max(1_000_000),
  description: z.string().max(500),
});
const planItemSchema = z.object({
  serviceId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  unit,
  qty: z.number().min(0).max(10_000_000),
  fullPrice: z.number().min(0).max(1_000_000),
  perVisit: z.number().min(0).max(1_000_000),
  frequency: z.enum(["monthly", "bimonthly", "quarterly", "semiannual", "annual"]),
  optional: z.boolean(),
});
const saveSchema = z.object({
  id: z.string().uuid().nullable(),
  contactId: z.string().min(5, "Pick a customer"),
  propertyAddress: z.string().trim().max(300),
  lines: z.array(lineSchema).min(1, "Add at least one service").max(40),
  planOffered: z.boolean(),
  planItems: z.array(planItemSchema).max(20),
  notes: z.string().max(4000),
});

export type SaveEstimateInput = z.infer<typeof saveSchema>;

export async function saveEstimate(input: SaveEstimateInput): Promise<EstimateResult> {
  const user = await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the estimate." };
  const v = parsed.data;
  if (v.planOffered && !v.planItems.length) return { error: "Add at least one service to the plan, or turn the plan off." };

  const db = await getDb();
  const [contact] = await db.select({ id: schema.ghlContacts.id }).from(schema.ghlContacts).where(eq(schema.ghlContacts.id, v.contactId));
  if (!contact) return { error: "That customer isn't in GHL anymore. Pick them again." };

  const settingsNow = await getPlanSettings();
  // Only frequencies the business currently offers.
  if (v.planItems.some((i) => !settingsNow.frequencies.includes(i.frequency))) {
    return { error: "One of the plan frequencies isn't offered anymore (Settings → Maintenance plans)." };
  }
  const values = {
    contactId: v.contactId,
    propertyAddress: v.propertyAddress || null,
    lines: v.lines,
    planOffered: v.planOffered,
    planItems: v.planOffered ? v.planItems : [],
    terms: termsFrom(settingsNow),
    notes: v.notes,
    validDays: settingsNow.validDays,
    updatedAt: new Date(),
  };

  if (v.id) {
    const [cur] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, v.id));
    if (!cur) return { error: "That estimate no longer exists." };
    if (cur.status === "accepted" || cur.status === "declined") {
      return { error: `This estimate was already ${cur.status} by the customer and can't be changed. Start a new one.` };
    }
    // Once sent, the customer's offer keeps the plan terms it went out with.
    const keepTerms = cur.status === "draft" ? {} : { terms: cur.terms, validDays: cur.validDays };
    await db.update(schema.estimates).set({ ...values, ...keepTerms }).where(eq(schema.estimates.id, v.id));
    revalidatePath(`/estimates/${v.id}`);
    return { ok: cur.status === "draft" ? "Draft saved." : "Saved — the customer's page now shows these changes.", id: v.id };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ top }] = await db.select({ top: max(schema.estimates.number) }).from(schema.estimates);
    try {
      const [row] = await db
        .insert(schema.estimates)
        .values({
          ...values,
          number: (top ?? 1000) + 1,
          publicToken: randomBytes(24).toString("base64url"),
          createdById: user.id,
          createdByName: user.name,
        })
        .returning({ id: schema.estimates.id, number: schema.estimates.number });
      revalidatePath("/estimates");
      return { ok: "Draft saved.", id: row.id, number: row.number };
    } catch (e) {
      if (attempt === 2) throw e; // number collision with a simultaneous save: retry
    }
  }
  return { error: "Couldn't save the estimate." };
}

/* ---------------- Send ---------------- */

/**
 * Mark the estimate sent and put the deal in "Estimate Sent" at the estimate's
 * one-time value, with a note on the contact linking to the customer's page.
 */
export async function sendEstimate(id: string): Promise<EstimateResult> {
  const user = await requireUser();
  const db = await getDb();
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est) return { error: "That estimate no longer exists." };
  if (est.status === "accepted" || est.status === "declined") return { error: `Already ${est.status}.` };
  const [contact] = await db.select().from(schema.ghlContacts).where(eq(schema.ghlContacts.id, est.contactId));
  if (!contact) return { error: "That customer isn't in GHL anymore." };

  const link = await customerLink(est);
  const oneTime = subtotal(est.lines);
  await db
    .update(schema.estimates)
    .set({ status: est.status === "draft" ? "sent" : est.status, sentAt: est.sentAt ?? new Date(), updatedAt: new Date() })
    .where(eq(schema.estimates.id, id));

  // GHL: deal → Estimate Sent, value = one-time price. Problems are reported but don't block sending.
  const problems: string[] = [];
  try {
    const oppId = await moveDealForEstimate(est, contact.name, /estimate\s*sent/i, oneTime);
    if (oppId && oppId !== est.opportunityId) {
      await db.update(schema.estimates).set({ opportunityId: oppId }).where(eq(schema.estimates.id, id));
    }
  } catch (e) {
    problems.push(`deal not updated (${errText(e)})`);
  }
  try {
    const t = totals(est.lines, est.planOffered ? est.planItems.filter((i) => !i.optional) : null, est.terms);
    const planLine = est.planOffered && t.plan
      ? `\nPlan offered: ${money(t.plan.billingAmount)} ${frequencyLabel(est.planItems[0]?.frequency ?? "quarterly").toLowerCase()} billing; ${t.discountPct}% off today if they join.`
      : "";
    await addNote(
      contact.id,
      `Estimate #${est.number} sent — ${money(oneTime)} one-time.${planLine}\nCustomer's page: ${link}\n\n— ${user.name} (Pintos CRM)`,
      user.ghlUserId,
    );
  } catch (e) {
    problems.push(`note not added (${errText(e)})`);
  }

  await db.insert(schema.activity).values({
    staffId: user.id,
    staffName: user.name,
    action: "estimate.send",
    contactId: contact.id,
    summary: `Sent estimate #${est.number} (${money(oneTime)} one-time)`,
  });
  revalidatePath(`/estimates/${id}`);
  revalidatePath(`/customers/${contact.id}`);
  revalidatePath("/pipeline");
  return {
    ok: "Estimate is live. Share the link, or send it by email or text below.",
    warning: problems.length ? `Sent, but in GHL: ${problems.join("; ")}.` : undefined,
    link,
  };
}

/* ---------------- Message the customer through GHL ---------------- */

async function estimateRecipient(id: string, channel: "email" | "sms") {
  const db = await getDb();
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est || est.status === "draft") return { error: "Send the estimate first." } as const;
  const [c] = await db.select().from(schema.ghlContacts).where(eq(schema.ghlContacts.id, est.contactId));
  if (!c) return { error: "That customer isn't in GHL anymore." } as const;
  if (channel === "email" && !c.email) return { error: "This customer has no email in GHL." } as const;
  if (channel === "sms" && !c.phone) return { error: "This customer has no phone number in GHL." } as const;
  if (channel === "sms" && c.dnd) return { error: "This customer is on Do Not Disturb in GHL." } as const;
  const first = c.firstName || c.name.split(" ")[0];
  return { est, c, msg: estimateMessage(channel, first, await customerLink(est)) } as const;
}

export interface MessagePreview {
  error?: string;
  to?: string;
  subject?: string | null;
  text?: string;
}

/** Exactly what "Email/Text via GHL" will send, for the confirmation step. */
export async function previewEstimateMessage(id: string, channel: "email" | "sms"): Promise<MessagePreview> {
  await requireUser();
  const r = await estimateRecipient(id, channel);
  if ("error" in r) return { error: r.error };
  return { to: `${r.c.name} · ${channel === "sms" ? r.c.phone : r.c.email}`, subject: r.msg.subject, text: r.msg.text };
}

export async function messageEstimate(id: string, channel: "email" | "sms"): Promise<EstimateResult> {
  const user = await requireUser();
  const r = await estimateRecipient(id, channel);
  if ("error" in r) return { error: r.error };
  const { est, c, msg } = r;
  try {
    if (channel === "sms") await sendSms(c.id, msg.text);
    else await sendEmail(c.id, msg.subject!, msg.html!);
  } catch (e) {
    return { error: `GHL couldn't send it: ${errText(e)}` };
  }
  await db_log(user, c.id, `Sent estimate #${est.number} by ${channel === "sms" ? "text" : "email"}`);
  revalidatePath(`/customers/${c.id}`);
  return { ok: `Sent by ${channel === "sms" ? "text" : "email"} through GHL.` };
}

async function db_log(user: { id: string; name: string }, contactId: string, summary: string) {
  const db = await getDb();
  await db.insert(schema.activity).values({ staffId: user.id, staffName: user.name, action: "estimate.message", contactId, summary });
}


/* ---------------- Pre-fill from Measure ---------------- */

export async function getMeasurePrefill(contactId: string): Promise<MeasurePrefill> {
  await requireUser();
  return measurePrefill(contactId);
}
