import "server-only";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { GhlContact, GhlCustomField, GhlOpportunity, GhlPipeline, PipelineStage } from "@/lib/db/schema";
import { startOfMonthEastern } from "@/lib/format";
import { CUSTOMER_TYPE_KEY, PROFILE_FIELD_GROUPS, PROPERTY_ADDRESS_KEY } from "./fields";

/* ---------------- Shared helpers ---------------- */

export type CustomerType = "Residential" | "Commercial" | null;

async function fieldsByKey(): Promise<Map<string, GhlCustomField>> {
  const db = await getDb();
  const rows = await db.select().from(schema.ghlCustomFields).where(eq(schema.ghlCustomFields.model, "contact"));
  return new Map(rows.map((f) => [f.fieldKey, f]));
}

function customerType(c: GhlContact, typeFieldId?: string): CustomerType {
  const v = typeFieldId ? c.custom[typeFieldId] : null;
  if (v === "Residential" || v === "Commercial") return v;
  if (c.tags.includes("customer:commercial")) return "Commercial";
  if (c.tags.includes("customer:residential")) return "Residential";
  return null;
}

/** Service address: the "Property Address" custom field, else the mailing address. */
function serviceAddress(c: GhlContact, propertyFieldId?: string): string | null {
  const prop = propertyFieldId ? c.custom[propertyFieldId] : null;
  if (typeof prop === "string" && prop.trim()) return prop.trim();
  const parts = [c.address1, c.city].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export async function getPipelines(): Promise<GhlPipeline[]> {
  const db = await getDb();
  return db.select().from(schema.ghlPipelines).orderBy(schema.ghlPipelines.name);
}

function stageLookup(pipelines: GhlPipeline[]) {
  const m = new Map<string, { pipeline: GhlPipeline; stage: PipelineStage; index: number }>();
  for (const p of pipelines) p.stages.forEach((stage, index) => m.set(stage.id, { pipeline: p, stage, index }));
  return m;
}

/* ---------------- Customers list ---------------- */

export type CustomerFilter = "all" | "residential" | "commercial" | "new" | "pipeline";

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  type: CustomerType;
  source: string | null;
  dateAdded: Date | null;
  /** The most recently active open deal, if any. */
  deal: { stage: string; value: number } | null;
  openValue: number;
}

export interface CustomerList {
  rows: CustomerRow[];
  counts: Record<CustomerFilter, number>;
  totals: { customers: number; newThisMonth: number; openValue: number; inPipeline: number };
}

export async function listCustomers(opts: { q?: string; filter?: CustomerFilter }): Promise<CustomerList> {
  const db = await getDb();
  const q = opts.q?.trim().toLowerCase();
  const [contacts, opps, pipelines, fields] = await Promise.all([
    db
      .select()
      .from(schema.ghlContacts)
      .where(q ? ilike(schema.ghlContacts.searchText, `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`) : undefined)
      .orderBy(desc(schema.ghlContacts.dateAdded)),
    db.select().from(schema.ghlOpportunities).where(eq(schema.ghlOpportunities.status, "open")),
    getPipelines(),
    fieldsByKey(),
  ]);

  const stages = stageLookup(pipelines);
  const typeId = fields.get(CUSTOMER_TYPE_KEY)?.id;
  const addrId = fields.get(PROPERTY_ADDRESS_KEY)?.id;

  const oppsByContact = new Map<string, GhlOpportunity[]>();
  for (const o of opps) {
    if (!o.contactId) continue;
    const list = oppsByContact.get(o.contactId) ?? [];
    list.push(o);
    oppsByContact.set(o.contactId, list);
  }

  const monthStart = startOfMonthEastern();
  const all: CustomerRow[] = contacts.map((c) => {
    const open = (oppsByContact.get(c.id) ?? []).sort(
      (a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0),
    );
    const latest = open[0];
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: serviceAddress(c, addrId),
      type: customerType(c, typeId),
      source: c.source,
      dateAdded: c.dateAdded,
      deal: latest ? { stage: stages.get(latest.stageId)?.stage.name ?? "Unknown stage", value: latest.value } : null,
      openValue: open.reduce((s, o) => s + o.value, 0),
    };
  });

  const isNew = (r: CustomerRow) => !!r.dateAdded && r.dateAdded >= monthStart;
  const match: Record<CustomerFilter, (r: CustomerRow) => boolean> = {
    all: () => true,
    residential: (r) => r.type === "Residential",
    commercial: (r) => r.type === "Commercial",
    new: isNew,
    pipeline: (r) => !!r.deal,
  };
  const counts = Object.fromEntries(
    (Object.keys(match) as CustomerFilter[]).map((k) => [k, all.filter(match[k]).length]),
  ) as Record<CustomerFilter, number>;

  return {
    rows: all.filter(match[opts.filter ?? "all"]),
    counts,
    totals: {
      customers: all.length,
      newThisMonth: counts.new,
      openValue: all.reduce((s, r) => s + r.openValue, 0),
      inPipeline: counts.pipeline,
    },
  };
}

/* ---------------- Customer profile ---------------- */

export interface ProfileField {
  id: string;
  key: string;
  name: string;
  dataType: string;
  options: string[];
  value: string | number | string[] | null;
}

export interface CustomerProfile {
  contact: GhlContact;
  type: CustomerType;
  address: string | null;
  groups: { title: string; fields: ProfileField[] }[];
  deals: (GhlOpportunity & { stageName: string; pipelineName: string })[];
  users: { id: string; name: string }[];
  activity: (typeof schema.activity.$inferSelect)[];
}

export async function getCustomer(id: string): Promise<CustomerProfile | null> {
  const db = await getDb();
  const [contact] = await db.select().from(schema.ghlContacts).where(eq(schema.ghlContacts.id, id));
  if (!contact) return null;

  const [opps, pipelines, fields, users, activity] = await Promise.all([
    db
      .select()
      .from(schema.ghlOpportunities)
      .where(eq(schema.ghlOpportunities.contactId, id))
      .orderBy(desc(schema.ghlOpportunities.updatedAt)),
    getPipelines(),
    fieldsByKey(),
    db.select({ id: schema.ghlUsers.id, name: schema.ghlUsers.name }).from(schema.ghlUsers),
    db
      .select()
      .from(schema.activity)
      .where(eq(schema.activity.contactId, id))
      .orderBy(desc(schema.activity.at))
      .limit(30),
  ]);

  const stages = stageLookup(pipelines);
  const groups = PROFILE_FIELD_GROUPS.map((g) => ({
    title: g.title,
    fields: g.keys
      .map((k) => fields.get(k))
      .filter((f): f is GhlCustomField => !!f)
      .map((f) => ({
        id: f.id,
        key: f.fieldKey,
        name: f.name,
        dataType: f.dataType,
        options: f.options,
        value: contact.custom[f.id] ?? null,
      })),
  })).filter((g) => g.fields.length);

  return {
    contact,
    type: customerType(contact, fields.get(CUSTOMER_TYPE_KEY)?.id),
    address: serviceAddress(contact, fields.get(PROPERTY_ADDRESS_KEY)?.id),
    groups,
    deals: opps.map((o) => ({
      ...o,
      stageName: stages.get(o.stageId)?.stage.name ?? "Unknown stage",
      pipelineName: stages.get(o.stageId)?.pipeline.name ?? "",
    })),
    users,
    activity,
  };
}

/* ---------------- Pipeline board ---------------- */

export interface BoardCard {
  id: string;
  name: string;
  status: string;
  value: number;
  stageId: string;
  contactId: string | null;
  contactName: string | null;
  contactDetail: string | null;
  assignee: string | null;
  lastStageChangeAt: string | null;
}

export interface Board {
  pipelines: { id: string; name: string }[];
  pipeline: GhlPipeline | null;
  cards: BoardCard[];
}

export async function getBoard(pipelineId?: string): Promise<Board> {
  const db = await getDb();
  const pipelines = await getPipelines();
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0] ?? null;
  if (!pipeline) return { pipelines: [], pipeline: null, cards: [] };

  const opps = await db
    .select()
    .from(schema.ghlOpportunities)
    .where(
      and(
        eq(schema.ghlOpportunities.pipelineId, pipeline.id),
        // Hide abandoned deals; open, won and lost stay visible in their stage.
        sql`${schema.ghlOpportunities.status} <> 'abandoned'`,
      ),
    )
    .orderBy(desc(schema.ghlOpportunities.lastStageChangeAt));

  const contactIds = [...new Set(opps.map((o) => o.contactId).filter((x): x is string => !!x))];
  const [contacts, users, fields] = await Promise.all([
    contactIds.length
      ? db.select().from(schema.ghlContacts).where(inArray(schema.ghlContacts.id, contactIds))
      : Promise.resolve([] as GhlContact[]),
    db.select({ id: schema.ghlUsers.id, name: schema.ghlUsers.name }).from(schema.ghlUsers),
    fieldsByKey(),
  ]);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const addrId = fields.get(PROPERTY_ADDRESS_KEY)?.id;

  return {
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name })),
    pipeline,
    cards: opps.map((o) => {
      const c = o.contactId ? byId.get(o.contactId) : undefined;
      return {
        id: o.id,
        name: o.name,
        status: o.status,
        value: o.value,
        stageId: o.stageId,
        contactId: o.contactId,
        contactName: c?.name ?? null,
        contactDetail: c ? serviceAddress(c, addrId) ?? c.phone ?? c.email : null,
        assignee: o.assignedTo ? userName.get(o.assignedTo) ?? null : null,
        lastStageChangeAt: (o.lastStageChangeAt ?? o.updatedAt)?.toISOString() ?? null,
      };
    }),
  };
}
