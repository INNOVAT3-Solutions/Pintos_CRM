import "server-only";
import { ghl, GhlError, locationId } from "./client";

/** GHL answers 404 for a missing deal but 400 "…not found…" for a missing contact. */
export const isNotFound = (e: unknown) =>
  e instanceof GhlError && (e.status === 404 || (e.status === 400 && /not found/i.test(e.message)));

/* Shapes returned by GHL API v2 (only the fields the CRM uses). */

export interface RawCustomValue {
  id: string;
  value?: string | number | string[] | null;
  /** GHL's create-contact response uses `fieldValue` instead of `value`. */
  fieldValue?: string | number | string[] | null;
}

export interface RawContact {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  type?: string | null;
  source?: string | null;
  tags?: string[];
  assignedTo?: string | null;
  dnd?: boolean;
  customFields?: RawCustomValue[];
  dateAdded?: string | null;
  dateUpdated?: string | null;
}

export interface RawOpportunity {
  id: string;
  name?: string | null;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  monetaryValue?: number | null;
  contactId?: string | null;
  assignedTo?: string | null;
  source?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastStageChangeAt?: string | null;
}

export interface RawPipeline {
  id: string;
  name: string;
  stages?: { id: string; name: string; position?: number }[];
}

export interface RawCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
  model: string;
  position?: number;
  picklistOptions?: string[];
}

export interface RawUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  deleted?: boolean;
  roles?: { role?: string };
}

export interface RawNote {
  id: string;
  body: string;
  userId?: string | null;
  dateAdded: string;
}

/* ---------------- Contacts ---------------- */

const CONTACT_PAGE = 100;

export async function fetchAllContacts(): Promise<RawContact[]> {
  const out: RawContact[] = [];
  for (let page = 1; ; page++) {
    const d = await ghl<{ contacts?: RawContact[]; total?: number }>("/contacts/search", {
      method: "POST",
      body: { locationId: locationId(), page, pageLimit: CONTACT_PAGE },
    });
    const batch = d.contacts ?? [];
    out.push(...batch);
    if (batch.length < CONTACT_PAGE || (d.total !== undefined && out.length >= d.total)) break;
  }
  return out;
}

export async function fetchContact(id: string): Promise<RawContact> {
  const d = await ghl<{ contact: RawContact }>(`/contacts/${id}`);
  return d.contact;
}

/** Fields the CRM can write on a contact. Custom fields by id. */
export interface ContactWrite {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  tags?: string[];
  assignedTo?: string | null;
  source?: string;
  customFields?: { id: string; field_value: string | number | string[] | null }[];
}

export async function createContact(input: ContactWrite): Promise<RawContact> {
  const d = await ghl<{ contact: RawContact }>("/contacts/", {
    method: "POST",
    body: { locationId: locationId(), ...input },
  });
  return d.contact;
}

export async function updateContact(id: string, input: ContactWrite): Promise<RawContact> {
  const d = await ghl<{ contact: RawContact }>(`/contacts/${id}`, { method: "PUT", body: input });
  return d.contact;
}

/* ---------------- Notes ---------------- */

export async function fetchNotes(contactId: string): Promise<RawNote[]> {
  const d = await ghl<{ notes?: RawNote[] }>(`/contacts/${contactId}/notes`);
  return d.notes ?? [];
}

export async function addNote(contactId: string, body: string, userId?: string | null): Promise<RawNote> {
  const d = await ghl<{ note: RawNote }>(`/contacts/${contactId}/notes`, {
    method: "POST",
    body: userId ? { body, userId } : { body },
  });
  return d.note;
}

/* ---------------- Pipelines & opportunities ---------------- */

export async function fetchPipelines(): Promise<RawPipeline[]> {
  const d = await ghl<{ pipelines?: RawPipeline[] }>("/opportunities/pipelines", {
    query: { locationId: locationId() },
  });
  return d.pipelines ?? [];
}

const OPP_PAGE = 100;

export async function fetchAllOpportunities(): Promise<RawOpportunity[]> {
  const out: RawOpportunity[] = [];
  let cursor: { startAfter?: number | string; startAfterId?: string } = {};
  for (let page = 1; ; page++) {
    const d = await ghl<{
      opportunities?: RawOpportunity[];
      meta?: { total?: number; nextPage?: number | string | null; startAfter?: number; startAfterId?: string };
    }>("/opportunities/search", {
      query: { location_id: locationId(), limit: OPP_PAGE, page, status: "all", ...cursor },
    });
    const batch = d.opportunities ?? [];
    out.push(...batch);
    if (!d.meta?.nextPage || batch.length === 0) break;
    cursor = { startAfter: d.meta.startAfter, startAfterId: d.meta.startAfterId };
  }
  return out;
}

export interface OpportunityWrite {
  name?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  status?: "open" | "won" | "lost" | "abandoned";
  monetaryValue?: number;
  contactId?: string;
  assignedTo?: string | null;
}

export async function fetchOpportunity(id: string): Promise<RawOpportunity> {
  const d = await ghl<{ opportunity: RawOpportunity }>(`/opportunities/${id}`);
  return d.opportunity;
}

export async function createOpportunity(input: OpportunityWrite): Promise<RawOpportunity> {
  const d = await ghl<{ opportunity: RawOpportunity }>("/opportunities/", {
    method: "POST",
    body: { locationId: locationId(), status: "open", ...input },
  });
  return d.opportunity;
}

export async function updateOpportunity(id: string, input: OpportunityWrite): Promise<RawOpportunity> {
  const d = await ghl<{ opportunity: RawOpportunity }>(`/opportunities/${id}`, { method: "PUT", body: input });
  return d.opportunity;
}

/* ---------------- Reference data ---------------- */

export async function fetchCustomFields(): Promise<RawCustomField[]> {
  const d = await ghl<{ customFields?: RawCustomField[] }>(`/locations/${locationId()}/customFields`);
  return d.customFields ?? [];
}

export async function fetchUsers(): Promise<RawUser[]> {
  const d = await ghl<{ users?: RawUser[] }>("/users/", { query: { locationId: locationId() } });
  return (d.users ?? []).filter((u) => !u.deleted);
}
