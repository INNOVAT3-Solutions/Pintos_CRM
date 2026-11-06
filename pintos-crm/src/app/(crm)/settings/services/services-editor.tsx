"use client";

import { useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";
import type { PriceUnit, Service, Surface } from "@/lib/db/schema";
import { deleteService, saveService, type SettingsResult } from "@/lib/estimates/settings-actions";
import { UNIT_LABEL } from "@/lib/estimates/pricing";
import { SURFACE_LABEL } from "@/lib/measure/calc";
import { money } from "@/lib/format";
import { Button, Notice } from "@/components/ui";

const input =
  "w-full rounded-lg border border-line-field bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-ink focus:border-sky focus:outline-none";
const UNITS: { id: PriceUnit; label: string }[] = [
  { id: "sqft", label: "per sq ft" },
  { id: "linear_ft", label: "per linear ft" },
  { id: "each", label: "each" },
  { id: "flat", label: "flat rate" },
];

type Draft = {
  id: string | null;
  name: string;
  unit: PriceUnit;
  price: string;
  minPrice: string;
  description: string;
  active: boolean;
  planEligible: boolean;
  measureSurface: Surface | "";
};

const toDraft = (s: Service | null): Draft => ({
  id: s?.id ?? null,
  name: s?.name ?? "",
  unit: s?.unit ?? "sqft",
  price: s ? String(s.price) : "",
  minPrice: s ? String(s.minPrice) : "0",
  description: s?.description ?? "",
  active: s?.active ?? true,
  planEligible: s?.planEligible ?? true,
  measureSurface: s?.measureSurface ?? "",
});

export function ServicesEditor({ services, canEdit }: { services: Service[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [msg, setMsg] = useState<SettingsResult | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {!canEdit && <Notice tone="info">Only admins can change prices.</Notice>}
      {msg?.ok && <Notice tone="ok">{msg.ok}</Notice>}
      {msg?.error && <Notice tone="error">{msg.error}</Notice>}
      {canEdit && editing !== "new" && (
        <div>
          <Button variant="secondary" onClick={() => setEditing("new")}>
            + Add a service
          </Button>
        </div>
      )}
      {editing === "new" && <Editor draft={toDraft(null)} onDone={(r) => { setMsg(r); setEditing(null); }} onCancel={() => setEditing(null)} />}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-[2.2fr_1fr_0.8fr_1fr_1fr_70px] gap-2.5 border-b border-line bg-[#F8FAFD] px-5 py-3 text-[10.5px] font-extrabold tracking-[1.2px] text-[#8AA0B8] md:grid">
          <div>SERVICE</div>
          <div>PRICE</div>
          <div>MINIMUM</div>
          <div>QTY FROM MEASURE</div>
          <div>PLANS</div>
          <div />
        </div>
        {services.map((s) =>
          editing === s.id ? (
            <div key={s.id} className="border-b border-[#F0F4F9] p-3 last:border-0">
              <Editor draft={toDraft(s)} review={s.needsReview} onDone={(r) => { setMsg(r); setEditing(null); }} onCancel={() => setEditing(null)} />
            </div>
          ) : (
            <div
              key={s.id}
              className={`grid grid-cols-[1fr_auto] items-center gap-2.5 border-b border-[#F0F4F9] px-4 py-3 last:border-0 md:grid-cols-[2.2fr_1fr_0.8fr_1fr_1fr_70px] md:px-5 ${s.active ? "" : "opacity-55"}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-ink">
                  {s.name}
                  {!s.active && <span className="text-[11px] font-bold text-muted">(hidden)</span>}
                </div>
                {s.needsReview && (
                  <div className="mt-0.5 flex items-start gap-1 text-[11.5px] font-bold text-warn">
                    <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden /> {s.needsReview}
                  </div>
                )}
              </div>
              <div className="text-right text-[13px] font-extrabold text-ink md:text-left">
                {money(s.price)} <span className="font-semibold text-muted">{UNIT_LABEL[s.unit].per}</span>
              </div>
              <div className="hidden text-[12.5px] font-semibold text-muted md:block">{s.minPrice ? money(s.minPrice) : "—"}</div>
              <div className="hidden text-[12.5px] font-semibold text-muted md:block">{s.measureSurface ? SURFACE_LABEL[s.measureSurface] : "—"}</div>
              <div className="hidden text-[12.5px] font-semibold text-muted md:block">{s.planEligible ? "Can be on a plan" : "One-time only"}</div>
              <div className="hidden text-right md:block">
                {canEdit && (
                  <button type="button" onClick={() => setEditing(s.id)} className="cursor-pointer rounded-lg px-2 py-1 text-[12.5px] font-extrabold text-blue hover:bg-hover hover:text-brand">
                    Edit
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function Editor({
  draft,
  review,
  onDone,
  onCancel,
}: {
  draft: Draft;
  review?: string | null;
  onDone: (r: SettingsResult) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState(draft);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const submit = () =>
    start(async () => {
      const r = await saveService({
        id: d.id,
        name: d.name,
        unit: d.unit,
        price: Number(d.price) || 0,
        minPrice: Number(d.minPrice) || 0,
        description: d.description,
        active: d.active,
        planEligible: d.planEligible,
        measureSurface: d.measureSurface || null,
        reviewed: true,
      });
      if (r.error) setErr(r.error);
      else onDone(r);
    });

  return (
    <div className="rounded-xl border border-line-soft bg-surface-soft p-3.5">
      {review && <div className="mb-2 text-[12px] font-bold text-warn">Import note: {review} Saving marks it as checked.</div>}
      {err && <div className="mb-2"><Notice tone="error">{err}</Notice></div>}
      <div className="grid gap-2.5 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Service name</span>
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Priced</span>
          <select value={d.unit} onChange={(e) => set({ unit: e.target.value as PriceUnit })} className={input}>
            {UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Price ($)</span>
          <input inputMode="decimal" value={d.price} onChange={(e) => set({ price: e.target.value })} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Minimum charge ($)</span>
          <input inputMode="decimal" value={d.minPrice} onChange={(e) => set({ minPrice: e.target.value })} className={input} />
        </label>
      </div>
      <div className="mt-2.5 grid gap-2.5 md:grid-cols-[2fr_1fr]">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Description</span>
          <input value={d.description} onChange={(e) => set({ description: e.target.value })} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Quantity comes from Measure</span>
          <select value={d.measureSurface} onChange={(e) => set({ measureSurface: e.target.value as Surface | "" })} className={input}>
            <option value="">No — enter by hand</option>
            {(Object.keys(SURFACE_LABEL) as Surface[]).map((s) => (
              <option key={s} value={s}>
                {SURFACE_LABEL[s]} area
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-bold text-ink-2">
          <input type="checkbox" className="size-4 accent-brand" checked={d.planEligible} onChange={(e) => set({ planEligible: e.target.checked })} />
          Can be on a maintenance plan
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-bold text-ink-2">
          <input type="checkbox" className="size-4 accent-brand" checked={d.active} onChange={(e) => set({ active: e.target.checked })} />
          Show in estimates
        </label>
        <div className="ml-auto flex gap-2">
          {d.id && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (confirm(`Remove “${d.name}” from the price list? Past estimates keep their own copy.`)) {
                  start(async () => onDone(await deleteService(d.id!)));
                }
              }}
              className="text-bad"
            >
              Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
