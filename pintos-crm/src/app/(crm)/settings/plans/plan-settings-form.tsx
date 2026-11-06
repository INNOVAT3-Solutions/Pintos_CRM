"use client";

import { useState, useTransition } from "react";
import type { Frequency } from "@/lib/db/schema";
import type { PlanSettings } from "@/lib/estimates/settings";
import { updatePlanSettings, type SettingsResult } from "@/lib/estimates/settings-actions";
import { FREQUENCIES, quotePlan } from "@/lib/estimates/pricing";
import { money } from "@/lib/format";
import { Button, Card, Notice, SectionLabel } from "@/components/ui";

const input =
  "w-full rounded-lg border border-line-field bg-surface px-3 py-2 text-[13.5px] font-semibold text-ink focus:border-sky focus:outline-none disabled:bg-field";

export function PlanSettingsForm({ initial, canEdit }: { initial: PlanSettings; canEdit: boolean }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<PlanSettings>) => {
    setS((x) => ({ ...x, ...patch }));
    setMsg(null);
  };
  const numField = (key: keyof PlanSettings, label: string, hint: string, suffix?: string) => (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-extrabold text-ink-2">{label}</span>
      <div className="relative">
        <input
          inputMode="decimal"
          disabled={!canEdit}
          value={String(s[key])}
          onChange={(e) => set({ [key]: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } as Partial<PlanSettings>)}
          className={`${input} ${suffix ? "pr-14" : ""}`}
        />
        {suffix && <span className="pointer-events-none absolute top-2 right-3 text-[12.5px] font-bold text-faint">{suffix}</span>}
      </div>
      <span className="mt-1 block text-[11.5px] font-semibold text-faint">{hint}</span>
    </label>
  );

  // Worked example so Nick sees what the numbers mean.
  const example = quotePlan(
    [
      { name: "Windows", perVisit: (240 * s.maintenancePct) / 100, frequency: "quarterly" },
      { name: "Driveway", perVisit: (212.5 * s.maintenancePct) / 100, frequency: "semiannual" },
    ],
    { ...s, tierEnabled: s.tierEnabled },
  );

  return (
    <div className="flex flex-col gap-3.5">
      {!canEdit && <Notice tone="info">Only admins can change plan settings.</Notice>}

      <Card>
        <SectionLabel>Plan</SectionLabel>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[12.5px] font-extrabold text-ink-2">Plan name (shown to homeowners)</span>
            <input disabled={!canEdit} value={s.planName} onChange={(e) => set({ planName: e.target.value })} className={input} />
          </label>
          {numField("maintenancePct", "Maintenance visit price", "Starting per-visit price for each service, as a % of its full one-time price. Adjustable per estimate.", "% of full")}
          {numField("discountPct", "Discount on today's service for joining", "The “why join” savings on the first job.", "% off")}
        </div>
      </Card>

      <Card>
        <label className="flex cursor-pointer items-center gap-2 text-[14px] font-extrabold text-ink">
          <input type="checkbox" className="size-4 accent-brand" disabled={!canEdit} checked={s.tierEnabled} onChange={(e) => set({ tierEnabled: e.target.checked })} />
          Bigger discount for bigger plans
        </label>
        <p className="mt-1 text-[12px] font-semibold text-muted">
          If the plan is worth at least this much per year, today&apos;s discount goes up — so adding services visibly lowers today&apos;s price.
        </p>
        {s.tierEnabled && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {numField("tierMinAnnual", "Plan worth at least", "Per year, across all its visits.", "$ / year")}
            {numField("tierPct", "Then today's discount is", "Replaces the standard discount above.", "% off")}
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>Visits & billing</SectionLabel>
        <fieldset className="mt-3">
          <legend className="mb-1.5 text-[12.5px] font-extrabold text-ink-2">How often homeowners can choose for each service</legend>
          <div className="flex flex-wrap gap-2">
            {FREQUENCIES.map((f) => {
              const on = s.frequencies.includes(f.id);
              return (
                <label
                  key={f.id}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-bold ${on ? "border-brand bg-brand-tint text-brand-deep" : "border-line-field text-ink-2"}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    disabled={!canEdit}
                    checked={on}
                    onChange={(e) =>
                      set({
                        frequencies: (e.target.checked ? [...s.frequencies, f.id] : s.frequencies.filter((x) => x !== f.id)).sort(
                          (a, b) => FREQUENCIES.findIndex((x) => x.id === a) - FREQUENCIES.findIndex((x) => x.id === b),
                        ) as Frequency[],
                      })
                    }
                  />
                  {f.label}
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11.5px] font-semibold text-faint">
            Customers are billed the same amount on a regular schedule — as often as their most frequent service.
          </p>
        </fieldset>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {numField("minPerBilling", "Minimum per bill", "0 = no minimum.", "$")}
          {numField("commitmentMonths", "Minimum term", "Shown in the plan terms. 0 = none.", "months")}
          {numField("validDays", "Estimates valid for", "After this, the link stops accepting.", "days")}
        </div>
      </Card>

      {example && (
        <Card className="border-dashed">
          <SectionLabel>Example with these settings</SectionLabel>
          <p className="mt-2 text-[13px] font-semibold text-ink-2">
            Windows ($240 full) every 3 months + driveway ($212.50 full) every 6 months →{" "}
            <b>{money(example.billingAmount)} every {example.billingMonths} months</b> ({money(example.annual)} a year), and{" "}
            <b>{example.discountPct}% off</b> today&apos;s service for joining.
          </p>
        </Card>
      )}

      {msg?.ok && <Notice tone="ok">{msg.ok}</Notice>}
      {msg?.error && <Notice tone="error">{msg.error}</Notice>}
      {canEdit && (
        <div>
          <Button disabled={pending || !s.frequencies.length} onClick={() => start(async () => setMsg(await updatePlanSettings(s)))}>
            {pending ? "Saving…" : "Save plan settings"}
          </Button>
        </div>
      )}
    </div>
  );
}
