import "server-only";
import { ghl, GhlError, locationId } from "./client";

/**
 * GHL "Properties" custom object (custom_objects.properties), linked to
 * contacts through the user-defined "property" association.
 *
 * Record values are keyed by the short field key (e.g. "square_footage") and
 * option fields store the option *key* (e.g. "residential"), not the label.
 */
export const PROPERTY_OBJECT = "custom_objects.properties";

/** Fields the Measure screen writes. Ones missing in GHL are skipped (see Settings). */
export const PROPERTY_FIELDS = {
  name: "property",
  address1: "address_line_1",
  city: "city",
  state: "state",
  zip: "zip__postal_code",
  squareFootage: "square_footage",
  stories: "stories",
  roof: "roof_area_sq_ft",
  houseWalls: "house_wall_area_sq_ft",
  driveway: "driveway_area_sq_ft",
  patio: "patio_deck_area_sq_ft",
  lastMeasured: "last_measured",
  notes: "measurement_notes",
} as const;

/** The six fields the CRM needs added to Properties for per-surface results. */
export const MEASUREMENT_FIELD_SPECS = [
  { key: "roof_area_sq_ft", name: "Roof Area (sq ft)", type: "Number" },
  { key: "house_wall_area_sq_ft", name: "House Wall Area (sq ft)", type: "Number" },
  { key: "driveway_area_sq_ft", name: "Driveway Area (sq ft)", type: "Number" },
  { key: "patio_deck_area_sq_ft", name: "Patio / Deck Area (sq ft)", type: "Number" },
  { key: "last_measured", name: "Last Measured", type: "Date" },
  { key: "measurement_notes", name: "Measurement Notes", type: "Multi-line text" },
] as const;

export interface PropertyFieldDef {
  key: string; // short key, e.g. "stories"
  name: string;
  dataType: string;
  options: { key: string; label: string }[];
}

interface RawField {
  fieldKey: string;
  name: string;
  dataType: string;
  options?: { key: string; label: string }[] | null;
}

let fieldCache: { at: number; defs: Map<string, PropertyFieldDef> } | null = null;

export async function propertyFields(): Promise<Map<string, PropertyFieldDef>> {
  if (fieldCache && Date.now() - fieldCache.at < 5 * 60_000) return fieldCache.defs;
  const d = await ghl<{ fields?: RawField[] }>(`/custom-fields/object-key/${PROPERTY_OBJECT}`, {
    query: { locationId: locationId() },
  });
  const defs = new Map<string, PropertyFieldDef>();
  for (const f of d.fields ?? []) {
    const key = f.fieldKey.replace(`${PROPERTY_OBJECT}.`, "");
    defs.set(key, { key, name: f.name, dataType: f.dataType, options: f.options ?? [] });
  }
  fieldCache = { at: Date.now(), defs };
  return defs;
}

/** Map a label like "3+" or a number like 3 to the option key GHL stores. */
export function optionKey(def: PropertyFieldDef | undefined, wanted: string): string | null {
  if (!def) return null;
  const w = wanted.trim().toLowerCase();
  const hit =
    def.options.find((o) => o.key.toLowerCase() === w || o.label.toLowerCase() === w) ??
    def.options.find((o) => o.label.toLowerCase().startsWith(w));
  return hit?.key ?? null;
}

export interface PropertyRecord {
  id: string;
  properties: Record<string, unknown>;
}

export async function getProperty(id: string): Promise<PropertyRecord> {
  const d = await ghl<{ record: PropertyRecord }>(`/objects/${PROPERTY_OBJECT}/records/${id}`, {
    query: { locationId: locationId() },
  });
  return d.record;
}

export async function createProperty(properties: Record<string, unknown>): Promise<PropertyRecord> {
  const d = await ghl<{ record: PropertyRecord }>(`/objects/${PROPERTY_OBJECT}/records`, {
    method: "POST",
    body: { locationId: locationId(), properties },
  });
  return d.record;
}

/** Merges: fields not sent are left as they are in GHL. */
export async function updateProperty(id: string, properties: Record<string, unknown>): Promise<PropertyRecord> {
  const d = await ghl<{ record: PropertyRecord }>(`/objects/${PROPERTY_OBJECT}/records/${id}`, {
    method: "PUT",
    query: { locationId: locationId() },
    body: { properties },
  });
  return d.record;
}

/* ---------------- Contact ↔ Property links ---------------- */

interface RawAssociation {
  id: string;
  key?: string;
  firstObjectKey?: string;
  secondObjectKey?: string;
}

let assocCache: { id: string; contactIsFirst: boolean } | null = null;

/** The association that links contacts to Properties. */
async function propertyAssociation(): Promise<{ id: string; contactIsFirst: boolean }> {
  if (assocCache) return assocCache;
  const d = await ghl<{ associations?: RawAssociation[] }>("/associations/", {
    query: { locationId: locationId(), skip: 0, limit: 100 },
  });
  const a = (d.associations ?? []).find(
    (x) =>
      (x.firstObjectKey === "contact" && x.secondObjectKey === PROPERTY_OBJECT) ||
      (x.secondObjectKey === "contact" && x.firstObjectKey === PROPERTY_OBJECT),
  );
  if (!a) throw new Error("GHL has no Contact ↔ Property association. Create one under Settings → Objects → Properties → Associations.");
  assocCache = { id: a.id, contactIsFirst: a.firstObjectKey === "contact" };
  return assocCache;
}

interface RawRelation {
  id?: string;
  associationId?: string;
  firstRecordId?: string;
  secondRecordId?: string;
}

export class MissingPermission extends Error {
  constructor(readonly scopes: string) {
    super(`The GHL token is missing permission: ${scopes}`);
  }
}

const RELATION_SCOPES = "associations/relation.readonly, associations/relation.write";

/** Property record ids linked to a contact. */
export async function contactPropertyIds(contactId: string): Promise<string[]> {
  const assoc = await propertyAssociation();
  try {
    const d = await ghl<{ relations?: RawRelation[] }>(`/associations/relations/${contactId}`, {
      query: { locationId: locationId(), skip: 0, limit: 100 },
    });
    return (d.relations ?? [])
      .filter((r) => r.associationId === assoc.id)
      .map((r) => (r.firstRecordId === contactId ? r.secondRecordId : r.firstRecordId))
      .filter((x): x is string => !!x);
  } catch (e) {
    if (e instanceof GhlError && e.isMissingScope) throw new MissingPermission(RELATION_SCOPES);
    throw e;
  }
}

export async function linkPropertyToContact(contactId: string, propertyId: string): Promise<void> {
  const assoc = await propertyAssociation();
  try {
    await ghl("/associations/relations", {
      method: "POST",
      body: {
        locationId: locationId(),
        associationId: assoc.id,
        firstRecordId: assoc.contactIsFirst ? contactId : propertyId,
        secondRecordId: assoc.contactIsFirst ? propertyId : contactId,
      },
    });
  } catch (e) {
    if (e instanceof GhlError && e.isMissingScope) throw new MissingPermission(RELATION_SCOPES);
    // Already linked is fine.
    if (e instanceof GhlError && /already|exist|duplicate/i.test(e.message)) return;
    throw e;
  }
}
