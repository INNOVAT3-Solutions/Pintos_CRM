"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { addCustomerNote, type ActionResult } from "@/lib/crm/actions";
import { Button, Notice } from "@/components/ui";

/** Notes live in GHL (the contact's Notes tab); this reads and adds to them. */
export function NotesCard({
  contactId,
  notes,
  loadFailed,
}: {
  contactId: string;
  notes: { id: string; body: string; when: string }[];
  loadFailed: boolean;
}) {
  const [state, setState] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await addCustomerNote(contactId, {}, data);
      setState(r);
      if (!r.error) ref.current?.reset();
    });
  };

  return (
    <div className="rounded-2xl border border-[#F5E3C8] bg-[#FFFBF4] p-5">
      <div className="mb-2 text-[15px] font-extrabold">Notes</div>
      <form ref={ref} onSubmit={onSubmit} className="mb-3 space-y-2">
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <textarea
          name="body"
          rows={2}
          aria-label="New note"
          placeholder="Add a note — saved to the contact in GHL"
          className="w-full rounded-[10px] border border-[#EAD9BD] bg-surface px-3 py-2 text-[13px] font-semibold text-ink focus:border-sky focus:outline-none"
        />
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Saving…" : "Add note"}
          </Button>
        </div>
      </form>

      {loadFailed && <p className="text-[12.5px] font-semibold text-bad">Couldn&apos;t load notes from GHL. Refresh to try again.</p>}
      {!loadFailed && notes.length === 0 && <p className="text-[12.5px] font-semibold text-[#A8946F]">No notes yet.</p>}
      <ul>
        {notes.map((n) => (
          <li key={n.id} className="border-t border-[#F2E6D2] py-2">
            <div className="text-[12.5px] leading-[1.55] font-semibold whitespace-pre-line text-[#6B5A3E]">{n.body}</div>
            <div className="mt-0.5 text-[11px] font-bold text-[#B8A27C]">{n.when}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
