import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Estimate } from "@/lib/db/schema";
import { addMonths } from "./pricing";
import { getPlanSettings } from "./settings";
import { fmtDate } from "@/lib/format";

/**
 * Props for the homeowner's estimate page, built the same way for the real
 * page (/e/<token>) and for staff's preview, so the preview can't drift.
 */
export async function customerViewProps(est: Estimate) {
  const db = await getDb();
  const [[contact], settings] = await Promise.all([
    db.select({ firstName: schema.ghlContacts.firstName, name: schema.ghlContacts.name }).from(schema.ghlContacts).where(eq(schema.ghlContacts.id, est.contactId)),
    getPlanSettings(),
  ]);
  const issued = est.sentAt ?? new Date();
  const validUntil = new Date(issued.getTime() + est.validDays * 86_400_000);
  const expired = !!est.sentAt && Date.now() > validUntil.getTime() && est.status !== "accepted" && est.status !== "declined";
  const monthName = (offset: number) =>
    new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" }).format(addMonths(new Date(), offset));

  return {
    token: est.publicToken,
    number: est.number,
    firstName: contact?.firstName || contact?.name.split(" ")[0] || "there",
    address: est.propertyAddress,
    status: est.status,
    expired,
    validUntil: fmtDate(validUntil),
    lines: est.lines,
    notes: est.notes,
    planOffered: est.planOffered,
    planItems: est.planItems,
    terms: est.terms,
    planName: settings.planName,
    choice: est.choice,
    monthNames: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => [m, monthName(m)])),
  };
}
