"use server";

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import type { Measurement, Surface } from "@/lib/db/schema";
import { GhlError } from "@/lib/ghl/client";
import { updateContact } from "@/lib/ghl/api";
import {
  contactPropertyIds,
  createProperty,
  getProperty,
  linkPropertyToContact,
  MissingPermission,
  optionKey,
  PROPERTY_FIELDS as F,
  propertyFields,
  updateProperty,
} from "@/lib/ghl/properties";
import { saveContact } from "@/lib/sync";
import { fmtDate, TZ } from "@/lib/format";
import { computeMeasurement, SURFACE_LABEL } from "./calc";
import { areaTitle, currentAreas } from "./areas";

const errText = (e: unknown) =>
  e instanceof MissingPermission
    ? `${e.message}. Add it in GHL → Settings → Private Integrations → Pintos CRM → Edit.`
    : e instanceof GhlError
      ? `GHL error: ${e.message}`
      : e instanceof Error
        ? e.message
        : String(e);

/* ---------------- Properties for a customer ---------------- */

export interface PropertyOption {
  id: string;
  label: string;
  squareFootage: number | null;
}

export async function getContactProperties(
  contactId: string,
): Promise<{ properties: PropertyOption[]; canLink: boolean; problem?: string }> {
  await requireUser();
  const db = await getDb();
  // Properties this CRM already wrote measurements to (known even without the link permission).
  const known = await db
    .selectDistinct({ id: schema.measurements.propertyRecordId })
    .from(schema.measurements)
    .where(and(eq(schema.measurements.contactId, contactId), isNotNull(schema.measurements.propertyRecordId)));

  let ids = known.map((k) => k.id!);
  let canLink = true;
  let problem: string | undefined;
  try {
    ids = [...new Set([...(await contactPropertyIds(contactId)), ...ids])];
  } catch (e) {
    canLink = !(e instanceof MissingPermission);
    problem = errText(e);
  }

  const properties: PropertyOption[] = [];
  for (const id of ids.slice(0, 20)) {
    try {
      const r = await getProperty(id);
      const p = r.properties;
      properties.push({
        id,
        label: String(p[F.name] ?? p[F.address1] ?? "Unnamed property"),
        squareFootage: typeof p[F.squareFootage] === "number" ? (p[F.squareFootage] as number) : null,
      });
    } catch {
      /* deleted in GHL — skip */
    }
  }
  return { properties, canLink, problem };
}

/* ---------------- Save a measurement ---------------- */

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

const inputSchema = z.object({
  contactId: z.string().min(5),
  /** Existing GHL property id, or "new". */
  propertyId: z.string().min(1),
  surface: z.enum(["roof", "house", "driveway", "patio", "walkway", "other"]),
  /** Name of this area on site ("Back patio", "Pool deck"); optional. */
  label: z.string().trim().max(60).optional().default(""),
  points: z.array(point).max(300),
  pitch: z.number().int().min(0).max(24),
  stories: z.number().int().min(1).max(3),
  houseMethod: z.enum(["siding", "living"]),
  solar: z.object({ sqft: z.number().min(50).max(500_000), segments: z.number().int().min(1).max(200) }).nullable(),
  address: z.object({
    formatted: z.string().max(300),
    line1: z.string().max(200),
    city: z.string().max(100),
    state: z.string().max(60),
    zip: z.string().max(20),
  }),
  center: point.nullable(),
});

export type SaveMeasurementInput = z.infer<typeof inputSchema>;

export interface SaveMeasurementResult {
  ok?: string;
  /** Saved in the CRM, but part of the GHL write failed. */
  warning?: string;
  error?: string;
  propertyId?: string;
}

const todayEastern = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // YYYY-MM-DD

/** "Back patio (patio / pool deck): 420 sq ft — … (Nov 5, 2026 · Nick)" — one line per current area. */
function notesFor(rows: Measurement[]): string {
  return currentAreas(rows)
    .map((r) => {
      return `${areaTitle(r)}: ${r.sqft.toLocaleString("en-US")} sq ft — ${r.method} (${fmtDate(r.createdAt)} · ${r.staffName})`;
    })
    .join("\n");
}

export async function saveMeasurement(raw: SaveMeasurementInput): Promise<SaveMeasurementResult> {
  const user = await requireUser();
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { error: "That measurement couldn't be read. Redraw the outline and try again." };
  const input = parsed.data;

  // Recompute on the server from the outline; never trust numbers from the browser.
  const result = computeMeasurement(input);
  if (result.sqft <= 0) {
    return { error: input.surface === "roof" ? "Close the outline (or use Google Solar) first." : "Close the outline first." };
  }

  const db = await getDb();
  const [contact] = await db.select().from(schema.ghlContacts).where(eq(schema.ghlContacts.id, input.contactId));
  if (!contact) return { error: "That customer no longer exists in GHL. Pick them again." };

  // 1) Keep the measurement in the CRM no matter what happens with GHL.
  const [row] = await db
    .insert(schema.measurements)
    .values({
      contactId: contact.id,
      propertyRecordId: input.propertyId === "new" ? null : input.propertyId,
      surface: input.surface,
      label: input.label || null,
      sqft: result.sqft,
      livingSqft: result.livingSqft,
      footprintSqft: result.footprintSqft || null,
      perimeterFt: result.perimeterFt || null,
      pitch: input.surface === "roof" ? input.pitch : null,
      stories: input.surface === "house" ? input.stories : null,
      usedSolar: input.surface === "roof" && !!input.solar && input.points.length < 3,
      method: result.method,
      points: input.points,
      address: input.address.formatted || null,
      lat: input.center?.lat ?? null,
      lng: input.center?.lng ?? null,
      staffId: user.id,
      staffName: user.name,
    })
    .returning();

  const label = `${input.label || SURFACE_LABEL[input.surface]} ${result.sqft.toLocaleString("en-US")} sq ft`;
  const fail = async (msg: string, propertyId?: string) => {
    await db.update(schema.measurements).set({ ghlError: msg, propertyRecordId: propertyId ?? row.propertyRecordId }).where(eq(schema.measurements.id, row.id));
    await db.insert(schema.activity).values({
      staffId: user.id,
      staffName: user.name,
      action: "measurement.add",
      contactId: contact.id,
      summary: `Measured ${label} (saved in CRM only — GHL: ${msg})`,
    });
    revalidatePath(`/customers/${contact.id}`);
    return { warning: `Saved in the CRM, but not fully in GHL: ${msg}`, propertyId };
  };

  // 2) Property record in GHL.
  let propertyId: string;
  let defs;
  try {
    defs = await propertyFields();
  } catch (e) {
    return fail(errText(e));
  }
  const has = (k: string) => defs.has(k);

  try {
    if (input.propertyId === "new") {
      // Check we can link before creating anything, so we never leave an unlinked property in GHL.
      await contactPropertyIds(contact.id);
      const a = input.address;
      const initial: Record<string, unknown> = {};
      if (has(F.name)) initial[F.name] = a.formatted || [a.line1, a.city].filter(Boolean).join(", ") || contact.name;
      if (has(F.address1) && a.line1) initial[F.address1] = a.line1;
      if (has(F.city) && a.city) initial[F.city] = a.city;
      if (has(F.state) && a.state) initial[F.state] = a.state;
      if (has(F.zip) && a.zip) initial[F.zip] = a.zip;
      if (has("name")) initial.name = contact.name;
      if (has("email") && contact.email) initial.email = contact.email;
      const created = await createProperty(initial);
      propertyId = created.id;
      await db.update(schema.measurements).set({ propertyRecordId: propertyId }).where(eq(schema.measurements.id, row.id));
      await linkPropertyToContact(contact.id, propertyId);
    } else {
      propertyId = input.propertyId;
    }
  } catch (e) {
    return fail(errText(e));
  }

  // 3) Numbers onto the property. Missing optional fields are skipped (listed in Settings).
  const history = await db
    .select()
    .from(schema.measurements)
    .where(and(eq(schema.measurements.contactId, contact.id), eq(schema.measurements.propertyRecordId, propertyId)))
    .orderBy(desc(schema.measurements.createdAt));

  // Each GHL area field holds the TOTAL of the current named areas of that type
  // (e.g. Patio / Deck Area = back patio + pool deck). Walkways and "other"
  // areas have no field of their own; they're listed in the notes.
  const values: Record<string, unknown> = {};
  const areas = currentAreas(history);
  const total = (s: Surface) => areas.filter((a) => a.surface === s).reduce((n, a) => n + a.sqft, 0);
  const surfaceField: Partial<Record<Surface, string | null>> = {
    roof: F.roof,
    house: input.houseMethod === "siding" ? F.houseWalls : null,
    driveway: F.driveway,
    patio: F.patio,
  };
  const sf = surfaceField[input.surface] ?? null;
  if (sf && has(sf)) values[sf] = input.surface === "roof" || input.surface === "house" ? result.sqft : total(input.surface);
  if (input.surface === "house" && result.livingSqft) {
    if (has(F.squareFootage)) values[F.squareFootage] = result.livingSqft;
    const sk = optionKey(defs.get(F.stories), String(input.stories));
    if (sk) values[F.stories] = sk;
  }
  if (has(F.lastMeasured)) values[F.lastMeasured] = todayEastern();
  if (has(F.notes)) values[F.notes] = notesFor(history);

  try {
    if (Object.keys(values).length) await updateProperty(propertyId, values);
  } catch (e) {
    return fail(errText(e), propertyId);
  }

  // 4) Mirror the house numbers onto the contact (its own Square Footage / Stories / Property Address fields).
  try {
    const contactFields = await db.select().from(schema.ghlCustomFields).where(eq(schema.ghlCustomFields.model, "contact"));
    const byKey = new Map(contactFields.map((f) => [f.fieldKey, f]));
    const cf: { id: string; field_value: string | number }[] = [];
    if (input.surface === "house" && result.livingSqft) {
      const sq = byKey.get("contact.square_footage");
      if (sq) cf.push({ id: sq.id, field_value: result.livingSqft });
      const st = byKey.get("contact.stories");
      const stLabel = st?.options.find((o) => o === String(input.stories) || o.startsWith(String(input.stories)));
      if (st && stLabel) cf.push({ id: st.id, field_value: stLabel });
    }
    const pa = byKey.get("contact.property_address");
    if (pa && !contact.custom[pa.id] && input.address.formatted) cf.push({ id: pa.id, field_value: input.address.formatted });
    if (cf.length) await saveContact(await updateContact(contact.id, { customFields: cf }));
  } catch (e) {
    return fail(`property updated, but the contact's fields weren't: ${errText(e)}`, propertyId);
  }

  await db.update(schema.measurements).set({ ghlSyncedAt: new Date(), ghlError: null, propertyRecordId: propertyId }).where(eq(schema.measurements.id, row.id));
  await db.insert(schema.activity).values({
    staffId: user.id,
    staffName: user.name,
    action: "measurement.add",
    contactId: contact.id,
    summary: `Measured ${label} — ${result.method}`,
  });
  revalidatePath(`/customers/${contact.id}`);
  const missing = [sf, F.lastMeasured, F.notes].filter((k): k is string => !!k && !has(k));
  return {
    ok: `${label} saved to GHL.`,
    warning: missing.length ? "Some measurement fields don't exist in GHL yet, so only part of it was stored there — see Settings." : undefined,
    propertyId,
  };
}

/* ---------------- History ---------------- */

export async function recentMeasurements(contactId: string) {
  await requireUser();
  const db = await getDb();
  return db
    .select()
    .from(schema.measurements)
    .where(eq(schema.measurements.contactId, contactId))
    .orderBy(desc(schema.measurements.createdAt))
    .limit(20);
}
