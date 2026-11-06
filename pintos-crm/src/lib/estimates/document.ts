import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Estimate } from "@/lib/db/schema";
import { PROPERTY_ADDRESS_KEY } from "@/lib/crm/fields";
import { businessProfile, type BusinessProfile } from "@/lib/ghl/estimates";
import { getPlanSettings } from "./settings";
import { customerLink } from "./server";

/** Everything the estimate document (PDF view) shows, gathered in one place. */
export interface EstimateDoc {
  est: Estimate;
  business: BusinessProfile;
  customer: { name: string; email: string | null; phone: string | null; mailing: string | null };
  serviceAddress: string | null;
  issued: Date;
  validUntil: Date;
  planName: string;
  link: string | null;
}

const FALLBACK_BUSINESS: BusinessProfile = { name: "Pinto's Pressure Washing", phone: null, email: null, website: null, address: null };

export async function loadEstimateDoc(est: Estimate): Promise<EstimateDoc> {
  const db = await getDb();
  const [[c], [addrField], settings, business] = await Promise.all([
    db.select().from(schema.ghlContacts).where(eq(schema.ghlContacts.id, est.contactId)),
    db.select({ id: schema.ghlCustomFields.id }).from(schema.ghlCustomFields).where(eq(schema.ghlCustomFields.fieldKey, PROPERTY_ADDRESS_KEY)),
    getPlanSettings(),
    businessProfile().catch(() => FALLBACK_BUSINESS),
  ]);
  const mailing = c ? [c.address1, c.city, [c.state, c.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null : null;
  const prop = c && addrField ? c.custom[addrField.id] : null;
  const issued = est.sentAt ?? est.createdAt;
  return {
    est,
    business,
    customer: { name: c?.name ?? "Customer", email: c?.email ?? null, phone: c?.phone ?? null, mailing },
    serviceAddress: est.propertyAddress || (typeof prop === "string" && prop.trim()) || mailing,
    issued,
    validUntil: new Date(issued.getTime() + est.validDays * 86_400_000),
    planName: settings.planName,
    link: est.status === "draft" ? null : await customerLink(est),
  };
}
