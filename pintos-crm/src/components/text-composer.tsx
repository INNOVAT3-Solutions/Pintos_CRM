"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MessageSquare } from "lucide-react";
import { sendText, type MessageResult } from "@/lib/messages/actions";
import { fill, TEMPLATES } from "@/lib/messages/templates";
import { Button, Card, Notice } from "@/components/ui";
import { MessagePreview } from "@/components/message-preview";

/** Text a customer through GHL, starting from a template if useful. */
export function TextComposer({
  contactId,
  firstName,
  phone,
  dnd,
  when,
  jobNumber,
  templates = TEMPLATES.map((t) => t.id),
}: {
  contactId: string;
  firstName: string;
  phone: string | null;
  dnd: boolean;
  when?: string | null;
  jobNumber?: number;
  templates?: string[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  // Two steps: write (with a live preview), then confirm the exact text and number.
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<MessageResult | null>(null);
  const [pending, start] = useTransition();
  const blocked = !phone ? "No phone number in GHL — add one to text this customer." : dnd ? "On Do Not Disturb in GHL — texts are blocked." : null;

  return (
    <Card>
      <div id="text" className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[15px] font-extrabold">
          <MessageSquare size={16} className="text-blue" aria-hidden /> Text {firstName}
        </div>
        {phone && <span className="text-[12px] font-bold text-muted">{phone}</span>}
      </div>
      {blocked ? (
        <p className="text-[12.5px] font-semibold text-warn">{blocked}</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {TEMPLATES.filter((t) => templates.includes(t.id)).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setText(fill(t.text, { first: firstName, when }));
                  setResult(null);
                  setConfirming(false);
                }}
                className="cursor-pointer rounded-full border border-line-field px-2.5 py-1 text-[11.5px] font-extrabold text-ink-2 hover:border-brand hover:text-brand-deep"
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            value={text}
            aria-label={`Text message to ${firstName}`}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
              setConfirming(false);
            }}
            placeholder="Write a text, or start from a template above"
            className="w-full rounded-[10px] border border-line-field bg-surface px-3 py-2 text-[13px] font-semibold text-ink focus:border-sky focus:outline-none"
          />
          <div className="mt-2">
            <MessagePreview channel="sms" to={`${firstName} · ${phone}`} text={text.trim()} />
          </div>
          {!confirming ? (
            <div className="mt-2 flex justify-end">
              <Button disabled={pending || text.trim().length < 2} onClick={() => setConfirming(true)}>
                Review &amp; send
              </Button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-brand/40 bg-brand-tint px-3 py-2">
              <span className="mr-auto text-[12.5px] font-extrabold text-brand-deep">Send this text to {phone}?</span>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                Keep editing
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await sendText({ contactId, text, jobNumber });
                    setResult(r);
                    setConfirming(false);
                    if (r.ok) {
                      setText("");
                      router.refresh();
                    }
                  })
                }
              >
                {pending ? "Sending…" : "Send now"}
              </Button>
            </div>
          )}
          {result?.error && <div className="mt-2"><Notice tone="error">{result.error}</Notice></div>}
          {result?.ok && <div className="mt-2"><Notice tone="ok">{result.ok}</Notice></div>}
        </>
      )}
    </Card>
  );
}
