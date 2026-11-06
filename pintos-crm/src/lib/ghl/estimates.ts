import "server-only";
import { ghl, locationId } from "./client";

/**
 * GHL estimates (invoices/estimate) and recurring invoice schedules
 * (invoices/schedule). Verified against the live API on 2026-11-05:
 * estimates are created as drafts and can be marked accepted; schedules are
 * created as drafts and send nothing until they're started.
 */

export interface GhlLineItem {
  name: string;
  description: string;
  amount: number;
  qty: number;
}

interface Business {
  name: string;
  phoneNo?: string;
  address?: { addressLine1?: string; city?: string; state?: string; postalCode?: string; countryCode?: string };
}

let businessCache: Business | null = null;
let profileCache: BusinessProfile | null = null;

export interface BusinessProfile {
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
}

/** Letterhead details for estimate documents, from the GHL sub-account's business profile. */
export async function businessProfile(): Promise<BusinessProfile> {
  if (profileCache) return profileCache;
  const d = await ghl<{
    location: { name: string; phone?: string; email?: string; website?: string; address?: string; city?: string; state?: string; postalCode?: string };
  }>(`/locations/${locationId()}`);
  const l = d.location;
  const cityLine = [l.city, [l.state, l.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  profileCache = {
    name: l.name,
    phone: l.phone || null,
    email: l.email || null,
    website: l.website || null,
    address: [l.address, cityLine].filter(Boolean).join(", ") || null,
  };
  return profileCache;
}

/** The company details GHL prints on estimates and invoices. */
async function business(): Promise<Business> {
  if (businessCache) return businessCache;
  const d = await ghl<{
    location: { name: string; phone?: string; address?: string; city?: string; state?: string; postalCode?: string; country?: string };
  }>(`/locations/${locationId()}`);
  const l = d.location;
  businessCache = {
    name: l.name,
    ...(l.phone ? { phoneNo: l.phone } : {}),
    ...(l.address
      ? { address: { addressLine1: l.address, city: l.city, state: l.state, postalCode: l.postalCode, countryCode: l.country || "US" } }
      : {}),
  };
  return businessCache;
}

export interface ContactRef {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

const contactDetails = (c: ContactRef) => ({
  id: c.id,
  name: c.name,
  ...(c.email ? { email: c.email } : {}),
  ...(c.phone ? { phoneNo: c.phone } : {}),
});

/** YYYY-MM-DD in Miami time. */
export const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

const item = (i: GhlLineItem) => ({
  name: i.name.slice(0, 200),
  description: i.description.slice(0, 500),
  currency: "USD",
  amount: i.amount,
  qty: i.qty,
  type: "one_time",
});

/**
 * Create the estimate in GHL for what the customer accepted, then mark it accepted.
 * A plan discount is applied as GHL's own percentage discount so its PDF shows it clearly.
 */
export async function createAcceptedEstimate(input: {
  contact: ContactRef;
  title: string;
  items: GhlLineItem[];
  discountPct: number;
  notesHtml: string;
  validDays: number;
}): Promise<{ id: string; total: number; number: number }> {
  const now = new Date();
  const created = await ghl<{ _id: string; total: number; estimateNumber: number }>("/invoices/estimate", {
    method: "POST",
    body: {
      altId: locationId(),
      altType: "location",
      name: input.title.slice(0, 40),
      title: "ESTIMATE",
      businessDetails: await business(),
      currency: "USD",
      items: input.items.map(item),
      discount: input.discountPct > 0 ? { type: "percentage", value: input.discountPct } : { type: "fixed", value: 0 },
      contactDetails: contactDetails(input.contact),
      issueDate: ymd(now),
      expiryDate: ymd(new Date(now.getTime() + input.validDays * 86_400_000)),
      frequencySettings: { enabled: false },
      liveMode: true,
      termsNotes: input.notesHtml,
    },
  });
  await ghl(`/invoices/estimate/${created._id}/status`, {
    method: "PATCH",
    body: { altId: locationId(), altType: "location", estimateStatus: "accepted" },
  });
  return { id: created._id, total: created.total, number: created.estimateNumber };
}

/**
 * Recurring bill for a maintenance plan, created as a DRAFT: GHL sends nothing
 * until someone starts it (GHL → Payments → Recurring invoices, or the CRM once
 * card payments are connected).
 */
export async function createDraftPlanSchedule(input: {
  contact: ContactRef;
  name: string;
  description: string;
  amount: number;
  everyMonths: number;
  firstBilling: Date;
  notesHtml: string;
}): Promise<{ id: string }> {
  const start = ymd(input.firstBilling);
  const d = await ghl<{ _id: string }>("/invoices/schedule", {
    method: "POST",
    body: {
      altId: locationId(),
      altType: "location",
      name: input.name.slice(0, 80),
      contactDetails: contactDetails(input.contact),
      schedule: {
        rrule: { intervalType: "monthly", interval: input.everyMonths, startDate: start, dayOfMonth: Number(start.slice(8, 10)) },
      },
      liveMode: true,
      businessDetails: await business(),
      currency: "USD",
      items: [item({ name: input.name, description: input.description, amount: input.amount, qty: 1 })],
      discount: { type: "fixed", value: 0 },
      termsNotes: input.notesHtml,
    },
  });
  return { id: d._id };
}

export async function addContactTags(contactId: string, tags: string[]) {
  await ghl(`/contacts/${contactId}/tags`, { method: "POST", body: { tags } });
}
