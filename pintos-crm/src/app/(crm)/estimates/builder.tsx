"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Copy, ExternalLink, Mail, MessageSquare, Plus, Ruler, Trash2 } from "lucide-react";
import type { EstimateChoice, EstimateLine, Frequency, PlanItem, PlanTerms, Service, Surface } from "@/lib/db/schema";
import { SURFACE_LABEL } from "@/lib/measure/calc";
import {
  getMeasurePrefill,
  messageEstimate,
  previewEstimateMessage,
  saveEstimate,
  type MessagePreview as MessagePreviewData,
  sendEstimate,
  type EstimateResult,
  type MeasurePrefill,
} from "@/lib/estimates/actions";
import {
  defaultPerVisit,
  describeLine,
  FREQUENCIES,
  frequencyLabel,
  lineTotal,
  totals,
  UNIT_LABEL,
} from "@/lib/estimates/pricing";
import { fmtDate, money } from "@/lib/format";
import { CustomerPicker, type Customer } from "@/components/customer-picker";
import { Button, Card, Notice, Pill, SectionLabel } from "@/components/ui";
import { MessagePreview } from "@/components/message-preview";

export interface BuilderEstimate {
  id: string | null;
  number: number | null;
  status: string;
  customer: Customer | null;
  propertyAddress: string;
  lines: EstimateLine[];
  planOffered: boolean;
  planItems: PlanItem[];
  notes: string;
  link: string | null;
  choice: EstimateChoice | null;
  ghlError: string | null;
  ghlEstimateId: string | null;
  ghlScheduleId: string | null;
}

const input =
  "w-full rounded-lg border border-line-field bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-ink focus:border-sky focus:outline-none disabled:bg-field";
const num = (s: string) => {
  const n = Number(s.replace(/[,$\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  draft: "neutral",
  sent: "warn",
  viewed: "warn",
  accepted: "good",
  declined: "bad",
};

export function EstimateBuilder({
  initial,
  services,
  terms,
  planName,
  initialPrefill,
  autofillFromMeasure = false,
}: {
  initial: BuilderEstimate;
  services: Service[];
  terms: PlanTerms;
  planName: string;
  initialPrefill: MeasurePrefill | null;
  /** Opened from Measure: start with one line per measured area type. */
  autofillFromMeasure?: boolean;
}) {
  const router = useRouter();
  const estId = initial.id;
  const estNumber = initial.number;
  // Local so "sent" shows immediately after sending, before the page data refreshes.
  const [status, setStatus] = useState(initial.status);
  const locked = status === "accepted" || status === "declined";

  const [customer, setCustomer] = useState<Customer | null>(initial.customer);
  const [address, setAddress] = useState(initial.propertyAddress);
  const [lines, setLines] = useState<EstimateLine[]>(initial.lines);
  const [planOffered, setPlanOffered] = useState(initial.planOffered);
  const [planItems, setPlanItems] = useState<PlanItem[]>(initial.planItems);
  const [notes, setNotes] = useState(initial.notes);
  const [prefill, setPrefill] = useState<MeasurePrefill | null>(initialPrefill);
  const [dirty, setDirty] = useState(false);
  const touch = () => setDirty(true);

  // Load the customer's measurements when the customer changes.
  useEffect(() => {
    if (!customer || (initialPrefill && customer.id === initial.customer?.id)) return;
    let live = true;
    getMeasurePrefill(customer.id).then((p) => {
      if (!live) return;
      setPrefill(p);
      if (!address && (p.address || customer.address)) setAddress(p.address ?? customer.address ?? "");
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const active = services.filter((s) => s.active);

  const measuredQty = (s: Service) => (s.measureSurface ? prefill?.bySurface[s.measureSurface] : undefined);

  /** Lines for every measured area type that has a linked price-list service and isn't on the estimate yet. */
  const measuredLines = (p: MeasurePrefill | null, existing: EstimateLine[]): EstimateLine[] => {
    if (!p) return [];
    const have = new Set(existing.map((l) => l.serviceId));
    const out: EstimateLine[] = [];
    for (const [surf, m] of Object.entries(p.bySurface) as [Surface, NonNullable<MeasurePrefill["bySurface"][Surface]>][]) {
      const s = active.find((x) => x.measureSurface === surf);
      if (!s || have.has(s.id)) continue;
      out.push({
        serviceId: s.id,
        name: s.name,
        unit: s.unit,
        qty: s.unit === "flat" ? 1 : m.sqft,
        unitPrice: s.price,
        minPrice: s.minPrice,
        description: m.parts ? `${m.parts} sq ft` : "",
      });
    }
    return out;
  };
  /** Measured area types with no price-list service linked (so they can't be added automatically). */
  const unlinkedSurfaces = (p: MeasurePrefill | null) =>
    p ? (Object.keys(p.bySurface) as Surface[]).filter((surf) => !active.some((x) => x.measureSurface === surf)) : [];

  // Opened from Measure: fill in today's services from the measured areas once.
  const autofilled = useRef(false);
  useEffect(() => {
    if (!autofillFromMeasure || autofilled.current || !prefill || initial.id) return;
    autofilled.current = true;
    const add = measuredLines(prefill, []);
    if (add.length) {
      setLines(add);
      setDirty(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const addLine = (serviceId: string) => {
    const s = byId.get(serviceId);
    if (!s) return;
    const m = measuredQty(s);
    setLines((ls) => [
      ...ls,
      {
        serviceId: s.id,
        name: s.name,
        unit: s.unit,
        qty: s.unit === "flat" ? 1 : (m?.sqft ?? (s.unit === "each" ? 1 : 0)),
        unitPrice: s.price,
        minPrice: s.minPrice,
        // e.g. "Back patio 420 + Pool deck 600 sq ft" — shown to the customer under the line.
        description: m?.parts ? `${m.parts} sq ft` : "",
      },
    ]);
    touch();
  };
  const setLine = (i: number, patch: Partial<EstimateLine>) => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    touch();
  };

  const planItemFrom = (l: Pick<EstimateLine, "serviceId" | "name" | "unit" | "qty" | "unitPrice" | "minPrice">, optional = false): PlanItem => {
    const full = lineTotal(l);
    return {
      serviceId: l.serviceId,
      name: l.name,
      unit: l.unit,
      qty: l.qty,
      fullPrice: full,
      perVisit: defaultPerVisit(full, terms),
      frequency: terms.frequencies.includes("quarterly") ? "quarterly" : terms.frequencies[0],
      optional,
    };
  };
  const addPlanFromLine = (l: EstimateLine) => {
    setPlanItems((ps) => [...ps, planItemFrom(l)]);
    touch();
  };
  const addPlanFromService = (serviceId: string) => {
    const s = byId.get(serviceId);
    if (!s) return;
    const m = measuredQty(s);
    const qty = s.unit === "flat" ? 1 : (m?.sqft ?? (s.unit === "each" ? 1 : 0));
    setPlanItems((ps) => [...ps, planItemFrom({ serviceId: s.id, name: s.name, unit: s.unit, qty, unitPrice: s.price, minPrice: s.minPrice }, true)]);
    touch();
  };
  const setPlan = (i: number, patch: Partial<PlanItem>) => {
    setPlanItems((ps) =>
      ps.map((p, j) => {
        if (j !== i) return p;
        const next = { ...p, ...patch };
        // Changing the quantity re-prices the item from the price list.
        if (patch.qty !== undefined && p.serviceId) {
          const s = byId.get(p.serviceId);
          if (s) {
            next.fullPrice = lineTotal({ unit: s.unit, qty: patch.qty, unitPrice: s.price, minPrice: s.minPrice });
            next.perVisit = defaultPerVisit(next.fullPrice, terms);
          }
        }
        return next;
      }),
    );
    touch();
  };

  const preselected = planItems.filter((p) => !p.optional);
  const oneTime = totals(lines, null, terms);
  const withPlan = planOffered && preselected.length ? totals(lines, preselected, terms) : null;
  const onLines = new Set(planItems.map((p) => p.name));

  /* ---------------- save / send ---------------- */
  const [pending, start] = useTransition();
  const [result, setResult] = useState<EstimateResult | null>(null);
  // Message handed over from the "new estimate" screen after the first save.
  useEffect(() => {
    if (!initial.id) return;
    try {
      const key = `estimate-result:${initial.id}`;
      const saved = sessionStorage.getItem(key);
      if (saved) {
        sessionStorage.removeItem(key);
        setResult(JSON.parse(saved) as EstimateResult);
      }
    } catch {
      /* ignore */
    }
  }, [initial.id]);
  const [link, setLink] = useState(initial.link);

  const payload = () => ({
    id: estId,
    contactId: customer?.id ?? "",
    propertyAddress: address,
    lines,
    planOffered,
    planItems: planOffered ? planItems : [],
    notes,
  });

  const save = (then?: "send") =>
    start(async () => {
      const r = await saveEstimate(payload());
      if (r.error || !r.id) {
        setResult(r);
        return;
      }
      setDirty(false);
      const isNew = !estId;
      let shown: EstimateResult = r;
      if (then === "send") {
        shown = await sendEstimate(r.id);
        if (shown.link) setLink(shown.link);
        if (!shown.error && status === "draft") setStatus("sent");
      }
      if (isNew) {
        // Open the estimate's own page, carrying the result over so the message isn't lost.
        try {
          sessionStorage.setItem(`estimate-result:${r.id}`, JSON.stringify(shown));
        } catch {
          /* storage unavailable: the page still loads, just without the message */
        }
        router.replace(`/estimates/${r.id}`);
        return;
      }
      setResult(shown);
      router.refresh();
    });

  // Email/Text via GHL: first show exactly what will be sent, then send on confirm.
  const [preview, setPreview] = useState<(MessagePreviewData & { channel: "email" | "sms" }) | null>(null);
  const openPreview = (channel: "email" | "sms") =>
    start(async () => {
      if (!estId) return;
      const p = await previewEstimateMessage(estId, channel);
      if (p.error) setResult({ error: p.error });
      else setPreview({ ...p, channel });
    });
  const message = (channel: "email" | "sms") =>
    start(async () => {
      if (estId) setResult(await messageEstimate(estId, channel));
      setPreview(null);
    });

  const isSent = status !== "draft" || !!link;

  return (
    <div className="grid items-start gap-3.5 xl:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-3.5">
        {locked && <DecisionBanner initial={{ ...initial, status }} />}

        {/* ---- customer ---- */}
        <div className="grid gap-3.5 md:grid-cols-2">
          {locked ? (
            <Card>
              <SectionLabel>Customer</SectionLabel>
              <Link href={`/customers/${customer?.id}`} className="mt-1 block text-[15px] font-extrabold text-ink hover:text-brand">
                {customer?.name}
              </Link>
            </Card>
          ) : (
            <CustomerPicker
              customer={customer}
              onChange={(c) => {
                setCustomer(c);
                touch();
              }}
            />
          )}
          <label className="block rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
            <span className="mb-1.5 block text-[10.5px] font-extrabold tracking-[1px] text-[#8AA0B8]">SERVICE ADDRESS</span>
            <input
              value={address}
              disabled={locked}
              onChange={(e) => {
                setAddress(e.target.value);
                touch();
              }}
              placeholder="Where the work is done"
              className={input}
            />
          </label>
        </div>

        {/* ---- today's services ---- */}
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[15px] font-extrabold">Today&apos;s service</div>
            {customer && prefill && Object.keys(prefill.bySurface).length === 0 && (
              <Link href={`/measure?contact=${customer.id}`} className="flex items-center gap-1 text-[12.5px] font-extrabold text-blue hover:text-brand">
                <Ruler size={13} aria-hidden /> Measure the property first
              </Link>
            )}
            {!locked && measuredLines(prefill, lines).length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setLines((ls) => [...ls, ...measuredLines(prefill, ls)]);
                  touch();
                }}
                className="flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-[#9CC3DE] px-2.5 py-1 text-[12.5px] font-extrabold text-blue hover:bg-[#EAF4FB]"
              >
                <Ruler size={13} aria-hidden /> Add all measured areas ({measuredLines(prefill, lines).length})
              </button>
            )}
          </div>
          {!locked && unlinkedSurfaces(prefill).length > 0 && (
            <p className="mb-2 text-[12px] font-bold text-warn">
              Measured {unlinkedSurfaces(prefill).map((x) => SURFACE_LABEL[x].toLowerCase()).join(", ")} but no price-list service is linked to{" "}
              {unlinkedSurfaces(prefill).length > 1 ? "them" : "it"} — add it by hand, or link one in Settings → Services &amp; Prices.
            </p>
          )}

          {lines.length === 0 && <p className="mb-3 text-[12.5px] font-semibold text-faint">Add the services for this job.</p>}
          <ul className="space-y-2">
            {lines.map((l, i) => {
              const s = l.serviceId ? byId.get(l.serviceId) : undefined;
              const m = s ? measuredQty(s) : undefined;
              return (
                <li key={i} className="rounded-xl border border-line-soft bg-surface-soft p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-[180px] flex-1">
                      <div className="text-[13.5px] font-extrabold text-ink">{l.name}</div>
                      <div className="text-[11.5px] font-semibold text-muted">
                        {describeLine(l)}
                        {l.minPrice > 0 && ` · min ${money(l.minPrice)}`}
                        {m && l.unit !== "flat" && (
                          <span className="ml-1 text-good">
                            · measured {m.sqft.toLocaleString("en-US")} sq ft{m.parts ? ` (${m.parts})` : ""} on {fmtDate(m.when)}
                          </span>
                        )}
                      </div>
                    </div>
                    {l.unit !== "flat" && (
                      <label className="w-[110px]">
                        <span className="sr-only">Quantity</span>
                        <div className="relative">
                          <input
                            inputMode="decimal"
                            aria-label={`${l.name} quantity`}
                            disabled={locked}
                            value={String(l.qty)}
                            onChange={(e) => setLine(i, { qty: num(e.target.value) })}
                            className={`${input} pr-12`}
                          />
                          <span className="pointer-events-none absolute top-[7px] right-2 text-[11px] font-bold text-faint">
                            {UNIT_LABEL[l.unit].short || "qty"}
                          </span>
                        </div>
                      </label>
                    )}
                    <label className="w-[104px]">
                      <span className="sr-only">Unit price</span>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-[7px] left-2 text-[12px] font-bold text-faint">$</span>
                        <input
                          inputMode="decimal"
                          aria-label={`${l.name} price`}
                          disabled={locked}
                          value={String(l.unitPrice)}
                          onChange={(e) => setLine(i, { unitPrice: num(e.target.value) })}
                          className={`${input} pl-5`}
                        />
                      </div>
                    </label>
                    <div className="w-[88px] pt-1.5 text-right text-[14px] font-extrabold text-ink">{money(lineTotal(l))}</div>
                    {!locked && (
                      <button
                        type="button"
                        aria-label={`Remove ${l.name}`}
                        onClick={() => {
                          setLines((ls) => ls.filter((_, j) => j !== i));
                          touch();
                        }}
                        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-subtle hover:bg-hover hover:text-bad"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    )}
                  </div>
                  <input
                    value={l.description}
                    disabled={locked}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    placeholder="Note for this line (optional) — e.g. includes front walkway"
                    aria-label={`${l.name} note`}
                    className={`${input} mt-2 text-[12.5px]`}
                  />
                </li>
              );
            })}
          </ul>

          {!locked && (
            <select
              aria-label="Add a service"
              value=""
              onChange={(e) => addLine(e.target.value)}
              className={`${input} mt-3 cursor-pointer font-extrabold text-blue`}
            >
              <option value="">+ Add a service…</option>
              {active.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {money(s.price)} {UNIT_LABEL[s.unit].per}
                  {measuredQty(s) ? " (measured)" : ""}
                </option>
              ))}
            </select>
          )}
        </Card>

        {/* ---- maintenance plan ---- */}
        <Card>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[15px] font-extrabold">{planName}</div>
              <div className="text-[12px] font-semibold text-muted">
                Per-visit price starts at {terms.maintenancePct}% of the full price · joining takes{" "}
                {terms.tierEnabled ? `${terms.discountPct}–${terms.tierPct}%` : `${terms.discountPct}%`} off today
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-extrabold text-ink">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={planOffered}
                disabled={locked}
                onChange={(e) => {
                  setPlanOffered(e.target.checked);
                  touch();
                }}
              />
              Offer a plan
            </label>
          </div>

          {planOffered && (
            <>
              <ul className="mt-3 space-y-2">
                {planItems.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-line-soft bg-surface-soft p-3">
                    <div className="min-w-[160px] flex-1">
                      <div className="text-[13.5px] font-extrabold text-ink">{p.name}</div>
                      <div className="text-[11.5px] font-semibold text-muted">
                        Full price {money(p.fullPrice)}
                        {p.unit !== "flat" && p.unit !== "each" && ` · ${p.qty.toLocaleString("en-US")} ${UNIT_LABEL[p.unit].short}`}
                      </div>
                    </div>
                    <select
                      aria-label={`${p.name} frequency`}
                      value={p.frequency}
                      disabled={locked}
                      onChange={(e) => setPlan(i, { frequency: e.target.value as Frequency })}
                      className={`${input} w-[150px]`}
                    >
                      {FREQUENCIES.filter((f) => terms.frequencies.includes(f.id)).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <label className="w-[120px]">
                      <span className="sr-only">Per visit</span>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-[7px] left-2 text-[12px] font-bold text-faint">$</span>
                        <input
                          inputMode="decimal"
                          aria-label={`${p.name} price per visit`}
                          disabled={locked}
                          value={String(p.perVisit)}
                          onChange={(e) => setPlan(i, { perVisit: num(e.target.value) })}
                          className={`${input} pl-5 pr-12`}
                        />
                        <span className="pointer-events-none absolute top-[7px] right-2 text-[11px] font-bold text-faint">/visit</span>
                      </div>
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[12px] font-bold text-ink-2" title="Shown to the homeowner unticked; they can add it">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-brand"
                        checked={p.optional}
                        disabled={locked}
                        onChange={(e) => setPlan(i, { optional: e.target.checked })}
                      />
                      Optional add-on
                    </label>
                    {!locked && (
                      <button
                        type="button"
                        aria-label={`Remove ${p.name} from plan`}
                        onClick={() => {
                          setPlanItems((ps) => ps.filter((_, j) => j !== i));
                          touch();
                        }}
                        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-subtle hover:bg-hover hover:text-bad"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {!locked && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {lines
                    .filter((l) => !onLines.has(l.name) && (!l.serviceId || byId.get(l.serviceId)?.planEligible !== false))
                    .map((l, i) => (
                      <button
                        key={`${l.name}-${i}`}
                        type="button"
                        onClick={() => addPlanFromLine(l)}
                        className="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-[#9CC3DE] px-3 py-1 text-[12px] font-extrabold text-blue hover:bg-[#EAF4FB]"
                      >
                        <Plus size={12} aria-hidden /> {l.name}
                      </button>
                    ))}
                  <select
                    aria-label="Add another service to the plan"
                    value=""
                    onChange={(e) => addPlanFromService(e.target.value)}
                    className="cursor-pointer rounded-full border border-line-field bg-surface px-3 py-1 text-[12px] font-extrabold text-ink-2"
                  >
                    <option value="">+ Other plan service…</option>
                    {active
                      .filter((s) => s.planEligible && !onLines.has(s.name))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </>
          )}
        </Card>

        <Card>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-extrabold text-ink-2">Notes for the customer (optional)</span>
            <textarea
              rows={3}
              value={notes}
              disabled={locked}
              onChange={(e) => {
                setNotes(e.target.value);
                touch();
              }}
              placeholder="Anything they should know — access, timing, what's excluded…"
              className={input}
            />
          </label>
        </Card>
      </div>

      {/* ---- summary / actions ---- */}
      <div className="flex flex-col gap-3.5 xl:sticky xl:top-4">
        <div className="rounded-2xl bg-gradient-to-br from-navy to-[#16406B] p-[18px] text-white shadow-[0_10px_28px_rgba(10,27,46,0.22)]">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-extrabold tracking-[1px] text-[#8FA9C2]">
              {estNumber ? `ESTIMATE #${estNumber}` : "NEW ESTIMATE"}
            </div>
            <Pill tone={STATUS_TONE[status] ?? "neutral"}>{status === "viewed" ? "opened" : status}</Pill>
          </div>

          <div className="mt-3 text-[11px] font-extrabold tracking-[0.6px] text-[#8FA9C2]">ONE-TIME</div>
          <div className="font-display text-[28px] font-extrabold" data-testid="one-time-total">
            {money(oneTime.today)}
          </div>

          {withPlan?.plan && (
            <div className="mt-3 rounded-xl bg-white/[0.07] p-3">
              <div className="text-[11px] font-extrabold tracking-[0.6px] text-[#F9C08A]">IF THEY JOIN THE PLAN</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-[12.5px] font-bold text-[#CDDDEE]">Today ({withPlan.discountPct}% off)</span>
                <span className="font-display text-[22px] font-extrabold text-[#F9A03F]" data-testid="plan-today-total">
                  {money(withPlan.today)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[12.5px] font-bold text-[#CDDDEE]">
                <span>Then every {withPlan.plan.billingMonths} mo</span>
                <span className="text-[15px] font-extrabold text-white" data-testid="plan-billing">
                  {money(withPlan.plan.billingAmount)}
                </span>
              </div>
              <div className="mt-2 border-t border-white/10 pt-2 text-[11.5px] leading-relaxed font-semibold text-[#9FB8D0]">
                {withPlan.plan.visits.map((v) => (
                  <div key={v.month}>
                    Month {v.month}: {v.items.join(", ")}
                  </div>
                ))}
              </div>
            </div>
          )}
          {planOffered && planItems.length > 0 && !preselected.length && (
            <div className="mt-3 text-[11.5px] font-bold text-[#F9C08A]">All plan items are optional — the homeowner builds the plan.</div>
          )}

          {!locked && (
            <div className="mt-4 flex flex-col gap-2">
              <Button disabled={pending || !customer || !lines.length} onClick={() => save("send")}>
                {pending ? "Working…" : isSent ? (dirty ? "Save & update customer's page" : "Re-send / refresh link") : "Save & send to customer"}
              </Button>
              <button
                type="button"
                disabled={pending || !customer || !lines.length}
                onClick={() => {
                  // Open the tab right away (browsers block tabs opened after a wait), then point it at the preview.
                  const tab = window.open("about:blank", "_blank");
                  if (tab) tab.opener = null;
                  start(async () => {
                    // Save first so the preview shows exactly what's on screen.
                    let id = estId;
                    if (!id || dirty) {
                      const r = await saveEstimate(payload());
                      if (r.error || !r.id) {
                        tab?.close();
                        setResult(r);
                        return;
                      }
                      id = r.id;
                      setDirty(false);
                    }
                    const url = `/estimates/${id}/preview`;
                    if (tab) tab.location.href = url;
                    else window.location.href = url;
                    if (!estId) router.replace(`/estimates/${id}`);
                  });
                }}
                className="cursor-pointer rounded-[10px] border border-[#F9A03F] py-2 text-[12.5px] font-extrabold text-[#F9C08A] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Preview PDF &amp; customer page
              </button>
              <button
                type="button"
                disabled={pending || !customer || !lines.length || (!dirty && !!estId)}
                onClick={() => save()}
                className="cursor-pointer rounded-[10px] border border-[#2A4A6C] py-2 text-[12.5px] font-extrabold text-[#CDDDEE] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {estId ? "Save changes" : "Save draft"}
              </button>
              {!customer && <div className="text-[11.5px] font-bold text-[#F9C08A]">Pick the customer first.</div>}
            </div>
          )}
        </div>

        {locked && estId && (
          <a href={`/estimates/${estId}/preview`} target="_blank" rel="noreferrer" className="rounded-[10px] border border-line-field bg-surface py-2 text-center text-[12.5px] font-extrabold text-ink hover:bg-hover">
            View PDF &amp; customer page
          </a>
        )}
        {result?.error && <Notice tone="error">{result.error}</Notice>}
        {result?.ok && <Notice tone="ok">{result.ok}</Notice>}
        {result?.warning && <div role="status" className="rounded-[10px] bg-warn-tint px-3 py-2.5 text-[12.5px] font-bold text-warn">{result.warning}</div>}

        {link && (
          <Card>
            <SectionLabel>Customer&apos;s page</SectionLabel>
            <div className="mt-2 flex gap-2">
              <input readOnly value={link} aria-label="Customer link" className={`${input} text-[12px]`} onFocus={(e) => e.currentTarget.select()} />
              <button
                type="button"
                aria-label="Copy link"
                onClick={() => navigator.clipboard?.writeText(link)}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line-field hover:bg-hover"
              >
                <Copy size={14} aria-hidden />
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-line-field px-3 py-1.5 text-[12.5px] font-extrabold text-ink hover:bg-hover">
                <ExternalLink size={13} aria-hidden /> Open
              </a>
              {!locked && (
                <>
                  <button type="button" disabled={pending} onClick={() => openPreview("email")} className="flex cursor-pointer items-center gap-1 rounded-lg border border-line-field px-3 py-1.5 text-[12.5px] font-extrabold text-ink hover:bg-hover disabled:opacity-50">
                    <Mail size={13} aria-hidden /> Email via GHL
                  </button>
                  <button type="button" disabled={pending} onClick={() => openPreview("sms")} className="flex cursor-pointer items-center gap-1 rounded-lg border border-line-field px-3 py-1.5 text-[12.5px] font-extrabold text-ink hover:bg-hover disabled:opacity-50">
                    <MessageSquare size={13} aria-hidden /> Text via GHL
                  </button>
                </>
              )}
            </div>
            {preview && (
              <div className="mt-3 space-y-2">
                <MessagePreview channel={preview.channel} to={preview.to ?? ""} subject={preview.subject} text={preview.text ?? ""} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" disabled={pending} onClick={() => setPreview(null)}>
                    Cancel
                  </Button>
                  <Button disabled={pending} onClick={() => message(preview.channel)}>
                    {pending ? "Sending…" : `Send ${preview.channel === "sms" ? "text" : "email"} now`}
                  </Button>
                </div>
              </div>
            )}
            <p className="mt-2 text-[11.5px] font-semibold text-faint">
              Until the CRM is online (phase 7), this link only opens on this computer.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function DecisionBanner({ initial }: { initial: BuilderEstimate }) {
  const c = initial.choice;
  return (
    <div
      className={`rounded-2xl border p-4 ${initial.status === "accepted" ? "border-good/30 bg-good-tint" : "border-bad/30 bg-bad-tint"}`}
      data-testid="decision"
    >
      {initial.status === "accepted" && c ? (
        <>
          <div className="text-[15px] font-extrabold text-good">
            Accepted by {c.signedName} — {money(c.todayTotal)} today
            {c.joinedPlan ? ` · joined the plan` : " · one-time"}
          </div>
          {c.joinedPlan && (
            <div className="mt-1 text-[13px] font-semibold text-ink-2">
              {money(c.billingAmount)} every {c.billingMonths} months ({c.discountPct}% off today):{" "}
              {c.items.map((i) => `${i.name} ${frequencyLabel(i.frequency).toLowerCase()}`).join(" · ")}
            </div>
          )}
          <div className="mt-2 text-[12px] font-bold text-ink-2">
            In GHL: {initial.ghlEstimateId ? "accepted estimate ✓" : "estimate missing"}
            {c.joinedPlan && (initial.ghlScheduleId ? " · recurring bill created as a draft ✓ (start it once payments are set up)" : " · recurring bill missing")}
          </div>
          {initial.ghlError && <div className="mt-2 text-[12px] font-bold text-warn">Needs attention: {initial.ghlError}</div>}
        </>
      ) : (
        <div className="text-[15px] font-extrabold text-bad">The customer declined this estimate.</div>
      )}
    </div>
  );
}
