"use server";

import { eq, ilike } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import type { GhlContact } from "@/lib/db/schema";
import { GhlError } from "@/lib/ghl/client";
import * as api from "@/lib/ghl/api";
import { saveContact, saveOpportunity, syncAll } from "@/lib/sync";
import { money } from "@/lib/format";
import { CUSTOMER_TYPE_KEY, EDITABLE_TYPES, PROFILE_FIELD_GROUPS } from "./fields";

/**
 * Every write goes to GHL first. Only when GHL accepts it do we save the record
 * GHL sends back into the local mirror — so the CRM never shows a change GHL
 * didn't actually store.
 */

export interface ActionResult {
  ok?: string;
  error?: string;
  /** Echo of what was submitted, so forms keep their values after an error. */
  values?: Record<string, string>;
  /** Id of a record the action created. */
  id?: string;
}

function ghlMessage(e: unknown): string {
  if (e instanceof GhlError) {
    if (e.isMissingScope) return "The GHL token is missing a permission for this. Check Settings.";
    if (e.status === 422 || e.status === 400) return `GHL rejected the change: ${e.message}`;
    if (e.status === 404) return "This record no longer exists in GHL. Refresh the page.";
    if (e.status === 429) return "GHL is busy (rate limit). Wait a few seconds and try again.";
    return `GHL error: ${e.message}`;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

async function log(user: CurrentUser, action: string, contactId: string | null, summary: string) {
  const db = await getDb();
  await db.insert(schema.activity).values({ staffId: user.id, staffName: user.name, action, contactId, summary });
}

const keep = (form: FormData) => {
  const out: Record<string, string> = {};
  for (const [k, v] of form) if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
};

/* ---------------- Sync ---------------- */

export async function syncNow(): Promise<ActionResult> {
  await requireUser();
  try {
    const r = await syncAll();
    revalidatePath("/", "layout");
    return { ok: `Synced ${r.contacts} contacts and ${r.opportunities} deals from GHL.` };
  } catch (e) {
    return { error: ghlMessage(e) };
  }
}

/* ---------------- Contacts ---------------- */

const STANDARD = ["firstName", "lastName", "email", "phone", "companyName", "address1", "city", "state", "postalCode"] as const;
const STANDARD_LABEL: Record<(typeof STANDARD)[number], string> = {
  firstName: "first name",
  lastName: "last name",
  email: "email",
  phone: "phone",
  companyName: "company",
  address1: "street address",
  city: "city",
  state: "state",
  postalCode: "ZIP",
};
type StandardKey = (typeof STANDARD)[number];

const standardSchema = z.object({
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().max(80),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  phone: z.string().trim().max(30),
  companyName: z.string().trim().max(120),
  address1: z.string().trim().max(200),
  city: z.string().trim().max(80),
  state: z.string().trim().max(40),
  postalCode: z.string().trim().max(20),
});

type FieldValue = string | number | string[] | null;

/** Turn the form's raw value for a custom field into what GHL expects for its type. */
function coerce(dataType: string, options: string[], raw: FormDataEntryValue[]): FieldValue | { error: string } {
  const first = typeof raw[0] === "string" ? raw[0].trim() : "";
  switch (dataType) {
    case "NUMERICAL":
    case "MONETORY": {
      if (!first) return null;
      const n = Number(first.replace(/[,$]/g, ""));
      return Number.isFinite(n) ? n : { error: "must be a number" };
    }
    case "MULTIPLE_OPTIONS":
    case "CHECKBOX":
      return raw.map(String).filter((v) => options.includes(v));
    case "SINGLE_OPTIONS":
    case "RADIO":
      if (!first) return null;
      return options.includes(first) ? first : { error: "is not one of the allowed options" };
    case "DATE":
      if (!first) return null;
      return /^\d{4}-\d{2}-\d{2}$/.test(first) ? first : { error: "must be a date" };
    default:
      return first || null;
  }
}

/**
 * Save the fields the person edited. The browser sends ONLY fields whose value
 * differs from what the form was loaded with (custom fields marked `present:<id>`),
 * so a field nobody touched is never sent — even if GHL's copy changed meanwhile.
 * That's what keeps GHL the master: we never write back a value we merely displayed.
 */
export async function updateCustomer(contactId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const values = keep(form);
  const db = await getDb();
  const [current] = await db.select().from(schema.ghlContacts).where(eq(schema.ghlContacts.id, contactId));
  if (!current) return { error: "This customer no longer exists in GHL. Refresh the page.", values };

  const body: api.ContactWrite = {};
  const changed: string[] = [];
  const merged: Record<StandardKey, string> = Object.fromEntries(
    STANDARD.map((k) => [k, (current[k as keyof GhlContact] as string | null) ?? ""]),
  ) as Record<StandardKey, string>;

  for (const k of STANDARD) {
    if (!form.has(k)) continue; // not edited
    const parsed = standardSchema.shape[k].safeParse(String(form.get(k) ?? ""));
    if (!parsed.success) return { error: parsed.error.issues[0]?.message, values };
    const next = parsed.data;
    merged[k] = next;
    (body as Record<StandardKey, string | null>)[k] = next || (k === "firstName" || k === "lastName" ? "" : null);
    changed.push(STANDARD_LABEL[k]);
  }
  if (!(merged.firstName || merged.lastName || merged.companyName || merged.email || merged.phone)) {
    return { error: "A customer needs at least a name, company, email or phone.", values };
  }

  // Custom fields: only those the profile shows, only the ones sent as edited.
  const allowedKeys = new Set(PROFILE_FIELD_GROUPS.flatMap((g) => g.keys));
  const defs = await db.select().from(schema.ghlCustomFields).where(eq(schema.ghlCustomFields.model, "contact"));
  const customChanges: { id: string; field_value: FieldValue }[] = [];
  for (const f of defs) {
    if (!form.has(`present:${f.id}`)) continue; // not edited
    if (!allowedKeys.has(f.fieldKey) || !EDITABLE_TYPES.has(f.dataType)) continue;
    const v = coerce(f.dataType, f.options, form.getAll(`cf:${f.id}`));
    if (v && typeof v === "object" && !Array.isArray(v)) return { error: `${f.name} ${v.error}.`, values };
    // GHL clears a field when given an empty string.
    customChanges.push({ id: f.id, field_value: v === null || (Array.isArray(v) && !v.length) ? "" : v });
    changed.push(f.name);
  }
  if (customChanges.length) body.customFields = customChanges;

  if (!changed.length) return { ok: "No changes to save." };

  try {
    const saved = await api.updateContact(contactId, body);
    await saveContact(saved);
  } catch (e) {
    return { error: ghlMessage(e), values };
  }
  await log(user, "contact.update", contactId, `Updated ${changed.join(", ")}`);
  revalidatePath(`/customers/${contactId}`);
  revalidatePath("/customers");
  return { ok: "Saved to GHL." };
}

const newCustomerSchema = z.object({
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().max(80),
  companyName: z.string().trim().max(120),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  phone: z.string().trim().max(30),
  address1: z.string().trim().max(200),
  city: z.string().trim().max(80),
  state: z.string().trim().max(40),
  postalCode: z.string().trim().max(20),
  customerType: z.enum(["", "Residential", "Commercial"]),
  addToPipeline: z.enum(["on", ""]),
  dealValue: z.string().trim(),
});

export async function createCustomer(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const values = keep(form);
  const parsed = newCustomerSchema.safeParse({
    ...Object.fromEntries(Object.keys(newCustomerSchema.shape).map((k) => [k, ""])),
    ...values,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values };
  const v = parsed.data;
  if (!(v.firstName || v.lastName || v.companyName)) return { error: "Enter a name or company.", values };
  if (!(v.email || v.phone)) return { error: "Enter an email or phone so the team can reach them.", values };
  const dealValue = v.dealValue ? Number(v.dealValue.replace(/[,$]/g, "")) : 0;
  if (!Number.isFinite(dealValue) || dealValue < 0) return { error: "Deal value must be a number.", values };

  const db = await getDb();
  const defs = await db.select().from(schema.ghlCustomFields).where(eq(schema.ghlCustomFields.fieldKey, CUSTOMER_TYPE_KEY));

  let contact: api.RawContact;
  try {
    contact = await api.createContact({
      firstName: v.firstName || undefined,
      lastName: v.lastName || undefined,
      companyName: v.companyName || null,
      email: v.email || null,
      phone: v.phone || null,
      address1: v.address1 || null,
      city: v.city || null,
      state: v.state || null,
      postalCode: v.postalCode || null,
      source: "Pintos CRM",
      tags: v.customerType ? [`customer:${v.customerType.toLowerCase()}`] : [],
      customFields: v.customerType && defs[0] ? [{ id: defs[0].id, field_value: v.customerType }] : undefined,
    });
    await saveContact(contact);
  } catch (e) {
    const msg = ghlMessage(e);
    // GHL refuses duplicates (same email/phone) and tells us which contact already has it.
    return { error: /duplicate/i.test(msg) ? "A contact with this email or phone already exists in GHL. Search for them instead." : msg, values };
  }
  await log(user, "contact.create", contact.id, "Created customer");

  if (v.addToPipeline === "on") {
    const [pipeline] = await db.select().from(schema.ghlPipelines).orderBy(schema.ghlPipelines.name);
    const first = pipeline?.stages[0];
    if (pipeline && first) {
      try {
        const name = [v.firstName, v.lastName].filter(Boolean).join(" ") || v.companyName;
        const opp = await api.createOpportunity({
          name,
          pipelineId: pipeline.id,
          pipelineStageId: first.id,
          contactId: contact.id,
          monetaryValue: dealValue,
        });
        await saveOpportunity(opp);
        await log(user, "opportunity.create", contact.id, `Added to ${pipeline.name} → ${first.name}`);
      } catch (e) {
        revalidatePath("/customers");
        return { ok: `Customer created, but adding the deal failed: ${ghlMessage(e)}`, id: contact.id };
      }
    }
  }

  revalidatePath("/customers");
  revalidatePath("/pipeline");
  return { ok: "Customer created in GHL.", id: contact.id };
}

export async function addCustomerNote(contactId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Write a note first." };
  if (body.length > 5000) return { error: "That note is too long.", values: { body } };
  try {
    // Sign the note so GHL shows who wrote it even though the integration posts it.
    await api.addNote(contactId, `${body}\n\n— ${user.name} (Pintos CRM)`, user.ghlUserId);
  } catch (e) {
    return { error: ghlMessage(e), values: { body } };
  }
  await log(user, "note.add", contactId, "Added a note");
  revalidatePath(`/customers/${contactId}`);
  return { ok: "Note saved to GHL." };
}

/* ---------------- Deals ---------------- */

async function findStage(stageId: string) {
  const db = await getDb();
  const pipelines = await db.select().from(schema.ghlPipelines);
  for (const p of pipelines) {
    const s = p.stages.find((x) => x.id === stageId);
    if (s) return { pipeline: p, stage: s };
  }
  return null;
}

const isLostStage = (name: string) => /\blost\b/i.test(name);

export async function moveDeal(oppId: string, stageId: string): Promise<ActionResult> {
  const user = await requireUser();
  const db = await getDb();
  const [opp] = await db.select().from(schema.ghlOpportunities).where(eq(schema.ghlOpportunities.id, oppId));
  if (!opp) return { error: "This deal no longer exists in GHL. Refresh the page." };
  if (opp.stageId === stageId) return { ok: "Already in that stage." };
  const target = await findStage(stageId);
  if (!target || target.pipeline.id !== opp.pipelineId) return { error: "That stage isn't in this deal's pipeline." };
  const from = await findStage(opp.stageId);

  // Keep GHL's status consistent with the Lost stage; otherwise leave status alone.
  const body: api.OpportunityWrite = { pipelineStageId: stageId };
  if (isLostStage(target.stage.name)) body.status = "lost";
  else if (opp.status === "lost") body.status = "open";

  try {
    await saveOpportunity(await api.updateOpportunity(oppId, body));
  } catch (e) {
    return { error: ghlMessage(e) };
  }
  await log(user, "opportunity.move", opp.contactId, `Moved "${opp.name}" from ${from?.stage.name ?? "?"} to ${target.stage.name}`);
  revalidatePath("/pipeline");
  if (opp.contactId) revalidatePath(`/customers/${opp.contactId}`);
  return { ok: `Moved to ${target.stage.name}.` };
}

const dealSchema = z.object({
  name: z.string().trim().min(1, "Give the deal a name").max(160),
  value: z.string().trim(),
  stageId: z.string().min(1),
  assignedTo: z.string(),
});

export async function saveDeal(contactId: string, oppId: string | null, _: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const values = keep(form);
  const parsed = dealSchema.safeParse({ name: "", value: "", stageId: "", assignedTo: "", ...values });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values };
  const value = parsed.data.value ? Number(parsed.data.value.replace(/[,$]/g, "")) : 0;
  if (!Number.isFinite(value) || value < 0) return { error: "Value must be a number.", values };
  const target = await findStage(parsed.data.stageId);
  if (!target) return { error: "Pick a stage.", values };

  const db = await getDb();
  if (parsed.data.assignedTo) {
    const [u] = await db.select().from(schema.ghlUsers).where(eq(schema.ghlUsers.id, parsed.data.assignedTo));
    if (!u) return { error: "That team member isn't in GHL.", values };
  }

  try {
    if (oppId) {
      const [opp] = await db.select().from(schema.ghlOpportunities).where(eq(schema.ghlOpportunities.id, oppId));
      if (!opp) return { error: "This deal no longer exists in GHL. Refresh the page.", values };
      const body: api.OpportunityWrite = {};
      const changes: string[] = [];
      if (parsed.data.name !== opp.name) {
        body.name = parsed.data.name;
        changes.push("name");
      }
      if (value !== opp.value) {
        body.monetaryValue = value;
        changes.push(`value → ${money(value)}`);
      }
      if (parsed.data.stageId !== opp.stageId) {
        body.pipelineStageId = parsed.data.stageId;
        if (isLostStage(target.stage.name)) body.status = "lost";
        else if (opp.status === "lost") body.status = "open";
        changes.push(`stage → ${target.stage.name}`);
      }
      if ((parsed.data.assignedTo || null) !== opp.assignedTo) {
        body.assignedTo = parsed.data.assignedTo || null;
        changes.push("owner");
      }
      if (!changes.length) return { ok: "No changes to save." };
      await saveOpportunity(await api.updateOpportunity(oppId, body));
      await log(user, "opportunity.update", contactId, `Deal "${parsed.data.name}": ${changes.join(", ")}`);
    } else {
      const opp = await api.createOpportunity({
        name: parsed.data.name,
        pipelineId: target.pipeline.id,
        pipelineStageId: target.stage.id,
        contactId,
        monetaryValue: value,
        assignedTo: parsed.data.assignedTo || undefined,
        status: isLostStage(target.stage.name) ? "lost" : "open",
      });
      await saveOpportunity(opp);
      await log(user, "opportunity.create", contactId, `New deal "${parsed.data.name}" in ${target.stage.name} (${money(value)})`);
    }
  } catch (e) {
    return { error: ghlMessage(e), values };
  }
  revalidatePath(`/customers/${contactId}`);
  revalidatePath("/pipeline");
  return { ok: "Deal saved to GHL." };
}

/** For the top-bar search: a few matching customers. */
export async function quickSearch(q: string): Promise<{ id: string; name: string; detail: string | null }[]> {
  await requireUser();
  const term = q.trim().toLowerCase();
  if (term.length < 2) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: schema.ghlContacts.id, name: schema.ghlContacts.name, email: schema.ghlContacts.email, phone: schema.ghlContacts.phone })
    .from(schema.ghlContacts)
    .where(ilike(schema.ghlContacts.searchText, `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`))
    .limit(8);
  return rows.map((r) => ({ id: r.id, name: r.name, detail: r.phone ?? r.email }));
}
