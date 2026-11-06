"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { GhlError } from "@/lib/ghl/client";
import { sendSms } from "@/lib/ghl/conversations";

export interface MessageResult {
  ok?: string;
  error?: string;
}

const input = z.object({
  contactId: z.string().min(5),
  text: z.string().trim().min(2, "Write a message first.").max(1500, "That's too long for a text (1,500 characters max)."),
  /** Optional job the text is about, for the activity log. */
  jobNumber: z.number().int().optional(),
});

/** Send an SMS through GHL (it appears in GHL Conversations like any other text). */
export async function sendText(raw: z.infer<typeof input>): Promise<MessageResult> {
  const user = await requireUser();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { contactId, text, jobNumber } = parsed.data;

  const db = await getDb();
  const [c] = await db.select().from(schema.ghlContacts).where(eq(schema.ghlContacts.id, contactId));
  if (!c) return { error: "That customer isn't in GHL anymore." };
  if (!c.phone) return { error: "This customer has no phone number in GHL." };
  if (c.dnd) return { error: "This customer is on Do Not Disturb in GHL, so texts are blocked." };

  try {
    await sendSms(contactId, text);
  } catch (e) {
    const msg = e instanceof GhlError ? e.message : String(e);
    return { error: `GHL couldn't send the text: ${msg}` };
  }
  await db.insert(schema.activity).values({
    staffId: user.id,
    staffName: user.name,
    action: "message.sms",
    contactId,
    summary: `Texted${jobNumber ? ` about job #${jobNumber}` : ""}: “${text.length > 80 ? `${text.slice(0, 80)}…` : text}”`,
  });
  revalidatePath(`/customers/${contactId}`);
  return { ok: "Text sent through GHL." };
}
