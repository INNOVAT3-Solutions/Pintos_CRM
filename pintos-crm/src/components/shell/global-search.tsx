"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { quickSearch } from "@/lib/crm/actions";

type Hit = { id: string; name: string; detail: string | null };

/** Top-bar search: suggests matching customers as you type; Enter opens the full results. */
export function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const r = await quickSearch(term);
      if (mine === seq.current) {
        setHits(r);
        setActive(-1);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const go = (path: string) => {
    setOpen(false);
    setQ("");
    router.push(path);
  };

  return (
    <div className="relative max-w-[420px] flex-1">
      <Search size={15} className="pointer-events-none absolute top-[9px] left-3 text-muted" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-label="Search customers"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        placeholder="Search customers…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, -1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (active >= 0 && hits[active]) go(`/customers/${hits[active].id}`);
            else if (q.trim()) go(`/customers?q=${encodeURIComponent(q.trim())}`);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-full border border-line-field bg-field py-2 pr-3 pl-[34px] text-[12.5px] font-semibold"
      />
      {open && hits.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-[42px] right-0 left-0 z-50 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[var(--shadow-card)]"
        >
          {hits.map((h, i) => (
            <li
              key={h.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(`/customers/${h.id}`);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3.5 py-2 ${i === active ? "bg-hover" : ""}`}
            >
              <div className="text-[13px] font-extrabold text-ink">{h.name}</div>
              {h.detail && <div className="text-[11.5px] font-semibold text-muted">{h.detail}</div>}
            </li>
          ))}
          <li
            role="option"
            aria-selected={false}
            onMouseDown={(e) => {
              e.preventDefault();
              go(`/customers?q=${encodeURIComponent(q.trim())}`);
            }}
            className="cursor-pointer border-t border-line-soft px-3.5 py-2 text-[12px] font-extrabold text-blue hover:bg-hover"
          >
            See all results for “{q.trim()}” →
          </li>
        </ul>
      )}
    </div>
  );
}
