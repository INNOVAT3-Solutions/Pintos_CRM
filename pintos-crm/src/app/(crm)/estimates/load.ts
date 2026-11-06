import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Estimate } from "@/lib/db/schema";
import { PROPERTY_ADDRESS_KEY } from "@/lib/crm/fields";
import { customerLink } from "@/lib/estimates/server";
import type { Customer } from "@/components/customer-picker";
import type { BuilderEstimate } from "./builder";

/** Customer summary (name + best service address) from the GHL mirror. */
export async function loadCustomer(contactId: string): Promise<Customer | null> {
  const db = await getDb();
  const [c] = await db.select().from(schema.ghlContacts).where(eq(schema.ghlContacts.id, contactId));
  if (!c) return null;
  const [f] = await db.select({ id: schema.ghlCustomFields.id }).from(schema.ghlCustomFields).where(eq(schema.ghlCustomFields.fieldKey, PROPERTY_ADDRESS_KEY));
  const prop = f ? c.custom[f.id] : null;
  const mailing = [c.address1, c.city, c.state, c.postalCode].filter(Boolean).join(", ");
  return { id: c.id, name: c.name, address: (typeof prop === "string" && prop.trim()) || mailing || null };
}

export { measurePrefill as loadPrefill } from "@/lib/estimates/server";

export async function toBuilder(e: Estimate): Promise<BuilderEstimate> {
  return {
    id: e.id,
    number: e.number,
    status: e.status,
    customer: await loadCustomer(e.contactId),
    propertyAddress: e.propertyAddress ?? "",
    lines: e.lines,
    planOffered: e.planOffered,
    planItems: e.planItems,
    notes: e.notes,
    link: e.status === "draft" ? null : await customerLink(e),
    choice: e.choice,
    ghlError: e.ghlError,
    ghlEstimateId: e.ghlEstimateId,
    ghlScheduleId: e.ghlScheduleId,
  };
}
