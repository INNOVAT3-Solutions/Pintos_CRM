"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createJob } from "@/lib/jobs/actions";
import { CustomerPicker, type Customer } from "@/components/customer-picker";
import { Button, Notice } from "@/components/ui";

const input =
  "w-full rounded-[10px] border border-line-field bg-surface px-3 py-2.5 text-[13.5px] font-semibold text-ink focus:border-sky focus:outline-none";

export function NewJobForm({ initialCustomer }: { initialCustomer: Customer | null }) {
  const router = useRouter();
  const [customer, setCustomer] = useState(initialCustomer);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState(initialCustomer?.address ?? "");
  const [services, setServices] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          const r = await createJob({
            contactId: customer?.id ?? "",
            title,
            address,
            services,
            amount: Number(amount.replace(/[,$]/g, "")) || 0,
          });
          if (r.error || !r.id) setError(r.error ?? "Couldn't create the job.");
          else router.push(`/jobs/${r.id}`);
        });
      }}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <CustomerPicker
        customer={customer}
        onChange={(c) => {
          setCustomer(c);
          if (c?.address && !address) setAddress(c.address);
        }}
      />
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-extrabold text-ink-2">What&apos;s the job?</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Re-wash back patio (callback)" className={input} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-extrabold text-ink-2">Address</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} className={input} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-extrabold text-ink-2">Services / steps (one per line — becomes the checklist)</span>
        <textarea rows={4} value={services} onChange={(e) => setServices(e.target.value)} className={input} />
      </label>
      <label className="block max-w-[220px]">
        <span className="mb-1.5 block text-[12px] font-extrabold text-ink-2">Amount ($, 0 if no charge)</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={input} />
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !customer || title.trim().length < 2}>
          {pending ? "Creating…" : "Create job"}
        </Button>
      </div>
    </form>
  );
}
