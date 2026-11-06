"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { quickSearch } from "@/lib/crm/actions";

export interface Customer {
  id: string;
  name: string;
  address: string | null;
}

/** Pick (or clear) the customer a measurement or estimate is for. */
export function CustomerPicker({ customer, onChange }: { customer: Customer | null; onChange: (c: Customer | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; detail: string | null }[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => quickSearch(term).then((r) => live && setHits(r)), 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  if (customer) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-extrabold tracking-[1px] text-[#8AA0B8]">CUSTOMER</div>
          <Link href={`/customers/${customer.id}`} className="block truncate text-[14px] font-extrabold text-ink hover:text-brand">
            {customer.name}
          </Link>
        </div>
        <button
          type="button"
          aria-label="Change customer"
          onClick={() => onChange(null)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-subtle hover:bg-hover hover:text-ink"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <label className="mb-1.5 block text-[10.5px] font-extrabold tracking-[1px] text-[#8AA0B8]" htmlFor="measure-customer">
        CUSTOMER
      </label>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute top-[9px] left-2.5 text-muted" aria-hidden />
        <input
          id="measure-customer"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search who this is for…"
          autoComplete="off"
          className="w-full rounded-lg border border-line-field py-[7px] pr-2 pl-8 text-[13px] font-semibold"
        />
      </div>
      {hits.length > 0 && (
        <ul className="absolute right-3 left-3 z-10 mt-1 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[var(--shadow-card)]">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ id: h.id, name: h.name, address: null });
                  setQ("");
                }}
                className="block w-full cursor-pointer px-3 py-2 text-left hover:bg-hover"
              >
                <div className="text-[13px] font-extrabold text-ink">{h.name}</div>
                {h.detail && <div className="text-[11.5px] font-semibold text-muted">{h.detail}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[11.5px] font-semibold text-faint">You can measure first and pick the customer before saving.</p>
    </div>
  );
}
