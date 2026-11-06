import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fetchContact, fetchOpportunity, isNotFound } from "@/lib/ghl/api";
import { saveContact, saveOpportunity } from "@/lib/sync";

/**
 * GHL → CRM webhook. Set up in GHL as a Workflow "Webhook" action pointing at
 *   https://<crm>/api/webhooks/ghl?key=<WEBHOOK_SECRET>
 * for triggers like Contact Created/Changed, Opportunity Created/Stage Changed,
 * Appointment booked/changed.
 *
 * The payload is treated only as a hint of WHICH record changed: the CRM
 * re-reads that record from GHL's API and stores what GHL says (or removes it
 * if GHL says it's gone). So a forged or stale payload can't inject data.
 */
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET ?? "";
  const given = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-pintos-key") ?? "";
  if (secret.length < 24 || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

const pick = (o: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && /^[A-Za-z0-9]{10,40}$/.test(v)) return v;
  }
  return null;
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }
  // GHL workflow webhooks nest some details; flatten one level for lookup.
  const flat: Record<string, unknown> = { ...body };
  for (const v of Object.values(body)) if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(flat, v);

  const contactId = pick(flat, ["contact_id", "contactId"]);
  const opportunityId = pick(flat, ["opportunity_id", "opportunityId", "pipleline_opportunity_id"]);
  const done: string[] = [];
  const db = await getDb();

  if (contactId) {
    try {
      await saveContact(await fetchContact(contactId));
      done.push("contact");
    } catch (e) {
      if (!isNotFound(e)) throw e;
      await db.delete(schema.ghlContacts).where(eq(schema.ghlContacts.id, contactId));
      done.push("contact-removed");
    }
  }
  if (opportunityId) {
    try {
      await saveOpportunity(await fetchOpportunity(opportunityId));
      done.push("opportunity");
    } catch (e) {
      if (!isNotFound(e)) throw e;
      await db.delete(schema.ghlOpportunities).where(eq(schema.ghlOpportunities.id, opportunityId));
      done.push("opportunity-removed");
    }
  }
  return NextResponse.json({ ok: true, updated: done });
}
