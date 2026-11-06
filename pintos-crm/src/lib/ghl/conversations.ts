import "server-only";
import { ghl, locationId } from "./client";

/** GHL Conversations: send SMS/email to a contact and read their message history. */
const V = "2021-04-15";

export interface Message {
  id: string;
  type: string; // TYPE_SMS, TYPE_EMAIL, TYPE_CALL, …
  direction: "inbound" | "outbound";
  body: string;
  at: string;
  status: string | null;
}

interface RawMessage {
  id: string;
  messageType?: string;
  direction?: string;
  body?: string;
  dateAdded?: string;
  status?: string;
}

/** Most recent messages with a contact, newest first (across all their conversations). */
export async function recentMessages(contactId: string, limit = 20): Promise<Message[]> {
  const d = await ghl<{ conversations?: { id: string }[] }>("/conversations/search", {
    query: { locationId: locationId(), contactId, limit: 5 },
    version: V,
  });
  const lists = await Promise.all(
    (d.conversations ?? []).map((c) =>
      ghl<{ messages?: { messages?: RawMessage[] } | RawMessage[] }>(`/conversations/${c.id}/messages`, {
        query: { limit },
        version: V,
      }).then((r) => (Array.isArray(r.messages) ? r.messages : (r.messages?.messages ?? []))),
    ),
  );
  return lists
    .flat()
    .map((m) => ({
      id: m.id,
      type: m.messageType ?? "TYPE_UNKNOWN",
      direction: m.direction === "inbound" ? ("inbound" as const) : ("outbound" as const),
      body: m.body ?? "",
      at: m.dateAdded ?? "",
      status: m.status ?? null,
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

export async function sendSms(contactId: string, message: string): Promise<void> {
  await ghl("/conversations/messages", { method: "POST", version: V, body: { type: "SMS", contactId, message } });
}

export async function sendEmail(contactId: string, subject: string, html: string): Promise<void> {
  await ghl("/conversations/messages", { method: "POST", version: V, body: { type: "Email", contactId, subject, html } });
}
