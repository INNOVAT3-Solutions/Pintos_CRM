"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/db/schema";
import { addExpense, deleteExpense, type ExpenseResult } from "@/lib/financials/actions";
import { Button, Notice } from "@/components/ui";

const input =
  "w-full rounded-lg border border-line-field bg-surface px-2.5 py-2 text-[13px] font-semibold text-ink focus:border-sky focus:outline-none";

const todayMiami = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

export function ExpenseForm() {
  const [date, setDate] = useState(todayMiami());
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Supplies & chemicals");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<ExpenseResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="mt-2 space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addExpense({ date, vendor, category, amount: Number(amount.replace(/[,$]/g, "")) || 0, notes });
          setResult(r);
          if (r.ok) {
            setVendor("");
            setAmount("");
            setNotes("");
          }
        });
      }}
    >
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Amount ($)</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={input} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Paid to</span>
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Home Depot" className={input} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={input}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Note (optional)</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
      </label>
      {result?.error && <Notice tone="error">{result.error}</Notice>}
      {result?.ok && <Notice tone="ok">{result.ok}</Notice>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Adding…" : "Add expense"}
      </Button>
    </form>
  );
}

export function DeleteExpense({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Remove expense ${label}`}
      disabled={pending}
      onClick={() => {
        if (confirm(`Remove ${label}?`)) start(async () => void (await deleteExpense(id)));
      }}
      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg text-subtle hover:bg-hover hover:text-bad disabled:opacity-40"
    >
      <Trash2 size={14} aria-hidden />
    </button>
  );
}
