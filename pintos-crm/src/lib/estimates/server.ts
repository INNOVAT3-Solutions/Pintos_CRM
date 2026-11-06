import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb, schema } from "@/lib/db";
import type { Estimate, EstimateChoice, Surface } from "@/lib/db/schema";
import { createOpportunity, updateContact, updateOpportunity } from "@/lib/ghl/api";
import { addContactTags, createAcceptedEstimate, createDraftPlanSchedule, ymd } from "@/lib/ghl/estimates";
import { saveContact, saveOpportunity } from "@/lib/sync";
import { addMonths, cents, describeLine, frequencyLabel, lineTotal } from "./pricing";
import { getPlanSettings } from "./settings";
import { currentAreas } from "@/lib/measure/areas";

/*
 * Server-only estimate helpers. Kept out of the "use server" action files on
 * purpose: everything exported from those is callable from the browser.
 */

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const customerLink = async (e: Pick<Estimate, "publicToken">) => `${await origin()}/e/${e.publicToken}`;

/** Find the customer's open deal (or create one) and move it to the stage matching `stage`, at `value`. */
export async function moveDealForEstimate(
  est: Pick<Estimate, "opportunityId" | "contactId" | "number">,
  contactName: string,
  stage: RegExp,
  value: number,
): Promise<string | null> {
  const db = await getDb();
  const [pipeline] = await db.select().from(schema.ghlPipelines).orderBy(schema.ghlPipelines.name);
  const target = pipeline?.stages.find((s) => stage.test(s.name));
  if (!pipeline || !target) throw new Error(`no "${stage.source}" stage in the GHL pipeline`);

  let oppId = est.opportunityId;
  if (!oppId) {
    const [open] = await db
      .select()
      .from(schema.ghlOpportunities)
      .where(
        and(
          eq(schema.ghlOpportunities.contactId, est.contactId),
          eq(schema.ghlOpportunities.pipelineId, pipeline.id),
          eq(schema.ghlOpportunities.status, "open"),
        ),
      )
      .orderBy(desc(schema.ghlOpportunities.updatedAt))
      .limit(1);
    oppId = open?.id ?? null;
  }
  const saved = oppId
    ? await updateOpportunity(oppId, { pipelineStageId: target.id, monetaryValue: value, status: "open" })
    : await createOpportunity({
        name: `${contactName} — Estimate #${est.number}`,
        pipelineId: pipeline.id,
        pipelineStageId: target.id,
        contactId: est.contactId,
        monetaryValue: value,
      });
  await saveOpportunity(saved);
  return saved.id;
}

/* ---------------- After the customer accepts ---------------- */

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (m) => `&#${m.charCodeAt(0)};`);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** GHL "Plan Billing Cycle" option names for each billing interval (used only if that option exists). */
const CYCLE_LABELS: Record<number, string[]> = {
  1: ["Monthly"],
  2: ["Every 2 Months", "Bi-Monthly", "Bimonthly"],
  3: ["Quarterly", "Every 3 Months"],
  6: ["Semi-Annual", "Semiannual", "Twice a Year", "Every 6 Months"],
  12: ["Annual", "Yearly"],
};

/**
 * Write an accepted estimate to GHL: the accepted estimate itself, the deal
 * (Accepted, at today's price), and — if they joined — the plan fields, the
 * membership tag and a DRAFT recurring bill. Each step runs independently;
 * failures are collected, stored on the estimate for staff, and returned.
 */
export async function pushAcceptedToGhl(est: Estimate, choice: EstimateChoice): Promise<string[]> {
  const db = await getDb();
  const problems: string[] = [];
  const [c] = await db.select().from(schema.ghlContacts).where(eq(schema.ghlContacts.id, est.contactId));
  if (!c) return ["customer no longer exists in GHL"];
  const settings = await getPlanSettings();
  const contact = { id: c.id, name: c.name, email: c.email, phone: c.phone };
  const today = new Date();
  const set: Partial<Estimate> = {};
  const firstBilling = addMonths(today, choice.billingMonths);

  const planHtml = choice.joinedPlan
    ? `<p><b>${esc(settings.planName)}</b>: ${choice.items.map((i) => `${esc(i.name)} (${frequencyLabel(i.frequency).toLowerCase()})`).join(", ")}. ` +
      `${money(choice.billingAmount)} billed every ${choice.billingMonths} month${choice.billingMonths > 1 ? "s" : ""}, first on ${ymd(firstBilling)}.` +
      (est.terms.commitmentMonths ? ` Minimum term ${est.terms.commitmentMonths} months.` : "") +
      `</p>`
    : "";

  // 1) Accepted estimate for today's service, with the plan discount if they joined.
  if (!est.ghlEstimateId) {
    try {
      const g = await createAcceptedEstimate({
        contact,
        title: `Estimate #${est.number}`,
        items: est.lines.map((l) => ({
          name: l.name,
          description: [describeLine(l), l.description].filter(Boolean).join(" — "),
          amount: lineTotal(l),
          qty: 1,
        })),
        discountPct: choice.discountPct,
        notesHtml: `<p>Accepted online by ${esc(choice.signedName)} on ${ymd(today)}.</p>${planHtml}${est.notes ? `<p>${esc(est.notes)}</p>` : ""}`,
        validDays: est.validDays,
      });
      set.ghlEstimateId = g.id;
      if (Math.abs(g.total - choice.todayTotal) > 0.02) {
        problems.push(`GHL total ${money(g.total)} differs from the CRM total ${money(choice.todayTotal)}`);
      }
    } catch (e) {
      problems.push(`estimate not created in GHL (${msg(e)})`);
    }
  }

  // 2) Deal → Accepted at today's price.
  try {
    set.opportunityId = (await moveDealForEstimate(est, c.name, /accepted/i, choice.todayTotal)) ?? est.opportunityId;
  } catch (e) {
    problems.push(`deal not moved (${msg(e)})`);
  }

  if (choice.joinedPlan) {
    // 3) Plan fields on the contact — only options that exist in GHL (Settings lists any missing).
    try {
      const fields = await db.select().from(schema.ghlCustomFields).where(eq(schema.ghlCustomFields.model, "contact"));
      const byKey = new Map(fields.map((f) => [f.fieldKey, f]));
      const cf: { id: string; field_value: string | number | string[] }[] = [];
      const put = (key: string, v: string | number | string[] | null) => {
        const f = byKey.get(key);
        if (f && v !== null && !(Array.isArray(v) && !v.length)) cf.push({ id: f.id, field_value: v });
      };
      const pick = (key: string, wanted: string[]) =>
        byKey.get(key)?.options.find((o) => wanted.some((w) => o.toLowerCase() === w.toLowerCase())) ?? null;

      put("contact.plan_name", `${settings.planName} — ${choice.items.map((i) => i.name).join(", ")}`.slice(0, 250));
      put("contact.plan_status", pick("contact.plan_status", ["Active"]));
      put("contact.plan_start_date", ymd(today));
      put("contact.plan_renewal_date", ymd(addMonths(today, est.terms.commitmentMonths || 12)));
      put("contact.plan_billing_cycle", pick("contact.plan_billing_cycle", CYCLE_LABELS[choice.billingMonths] ?? []));
      put("contact.member_discount", choice.discountPct);
      put("contact.service_interval_months", choice.billingMonths);
      put("contact.next_recommended_service_date", ymd(firstBilling));
      put("contact.customer_status", pick("contact.customer_status", ["Membership"]));
      const included = byKey.get("contact.included_services");
      if (included) {
        const words = (n: string): string[] => n.toLowerCase().match(/[a-z]+/g) ?? [];
        put(
          "contact.included_services",
          included.options.filter((o) => choice.items.some((i) => words(o).some((w) => w.length > 4 && words(i.name).includes(w)))),
        );
      }
      if (cf.length) await saveContact(await updateContact(c.id, { customFields: cf }));
      await addContactTags(c.id, ["customer:membership"]);
    } catch (e) {
      problems.push(`plan fields not written to the contact (${msg(e)})`);
    }

    // 4) Recurring bill — a DRAFT: nothing is sent or charged until someone starts it.
    if (!est.ghlScheduleId) {
      try {
        const s = await createDraftPlanSchedule({
          contact,
          name: `${settings.planName} — ${c.name}`,
          description: choice.items.map((i) => `${i.name}: ${frequencyLabel(i.frequency).toLowerCase()}`).join(" · "),
          amount: cents(choice.billingAmount),
          everyMonths: choice.billingMonths,
          firstBilling,
          notesHtml: planHtml,
        });
        set.ghlScheduleId = s.id;
      } catch (e) {
        problems.push(`recurring bill not created (${msg(e)})`);
      }
    }
  }

  await db
    .update(schema.estimates)
    .set({ ...set, ghlError: problems.length ? problems.join("; ") : null, updatedAt: new Date() })
    .where(eq(schema.estimates.id, est.id));
  return problems;
}

/* ---------------- Pre-fill from Measure ---------------- */

export interface MeasurePrefill {
  /**
   * Per surface: the total of its current named areas (house = living area when
   * known), e.g. patio = back patio 420 + pool deck 600 = 1,020 sq ft.
   */
  bySurface: Partial<Record<Surface, { sqft: number; when: string; method: string; parts: string }>>;
  address: string | null;
}

export async function measurePrefill(contactId: string): Promise<MeasurePrefill> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.measurements)
    .where(eq(schema.measurements.contactId, contactId))
    .orderBy(desc(schema.measurements.createdAt))
    .limit(100);
  const bySurface: MeasurePrefill["bySurface"] = {};
  for (const s of ["roof", "house", "driveway", "patio", "walkway", "other"] as Surface[]) {
    const areas = currentAreas(rows).filter((r) => r.surface === s);
    if (!areas.length) continue;
    // House washing is priced on the home's size, so prefer living area over wall area.
    const size = (r: (typeof rows)[number]) => (s === "house" ? (r.livingSqft ?? r.sqft) : r.sqft);
    const newest = areas.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    bySurface[s] = {
      sqft: areas.reduce((n, r) => n + size(r), 0),
      when: newest.createdAt.toISOString(),
      method: newest.method,
      parts: areas.length > 1 ? areas.map((r) => `${r.label?.trim() || "unnamed"} ${size(r).toLocaleString("en-US")}`).join(" + ") : "",
    };
  }
  return { bySurface, address: rows.find((r) => r.address)?.address ?? null };
}
