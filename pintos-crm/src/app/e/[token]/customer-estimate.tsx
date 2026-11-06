"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, CircleCheck } from "lucide-react";
import type { EstimateChoice, EstimateLine, Frequency, PlanItem, PlanTerms } from "@/lib/db/schema";
import { acceptEstimate, declineEstimate } from "@/lib/estimates/public-actions";
import { describeLine, FREQUENCIES, lineTotal, totals } from "@/lib/estimates/pricing";
import { money } from "@/lib/format";

interface Props {
  token: string;
  number: number;
  firstName: string;
  address: string | null;
  status: string;
  expired: boolean;
  validUntil: string | null;
  lines: EstimateLine[];
  notes: string;
  planOffered: boolean;
  planItems: PlanItem[];
  terms: PlanTerms;
  planName: string;
  choice: EstimateChoice | null;
  monthNames: Record<number, string>;
  /** Staff preview: everything works except Accept / Decline. */
  preview?: boolean;
}

const card = "rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]";

export function CustomerEstimate(p: Props) {
  const [mode, setMode] = useState<"plan" | "one">(p.planOffered ? "plan" : "one");
  const [picked, setPicked] = useState<boolean[]>(p.planItems.map((i) => !i.optional));
  const [freq, setFreq] = useState<Frequency[]>(p.planItems.map((i) => i.frequency));
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  // What they just agreed to (the server's saved choice arrives on the next visit).
  const [agreed, setAgreed] = useState<Pick<EstimateChoice, "todayTotal" | "joinedPlan" | "billingAmount" | "billingMonths"> | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | null>(
    p.status === "accepted" ? "accepted" : p.status === "declined" ? "declined" : null,
  );

  const chosen = useMemo(
    () => p.planItems.map((i, k) => ({ ...i, frequency: freq[k] })).filter((_, k) => picked[k]),
    [p.planItems, picked, freq],
  );
  const oneTime = totals(p.lines, null, p.terms);
  const withPlan = chosen.length ? totals(p.lines, chosen, p.terms) : null;
  const planActive = mode === "plan" && !!withPlan?.plan;
  const shown = planActive ? withPlan! : oneTime;

  const allowed = FREQUENCIES.filter((f) => p.terms.frequencies.includes(f.id));
  const canAct = !done && !p.expired;
  const locked = !!p.preview; // preview: buttons visible but can't submit

  const accept = () => {
    setError("");
    start(async () => {
      const r = await acceptEstimate({
        token: p.token,
        joinedPlan: planActive,
        items: planActive ? p.planItems.map((_, k) => ({ index: k, frequency: freq[k] })).filter((_, k) => picked[k]) : [],
        signedName: name,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setAgreed({
        todayTotal: shown.today,
        joinedPlan: planActive,
        billingAmount: withPlan?.plan?.billingAmount ?? 0,
        billingMonths: withPlan?.plan?.billingMonths ?? 0,
      });
      setDone("accepted");
    });
  };
  const decline = () => {
    setError("");
    start(async () => {
      const r = await declineEstimate({ token: p.token, reason });
      if (r.error) setError(r.error);
      else setDone("declined");
    });
  };

  /* ---------- after a decision ---------- */
  if (done === "declined") {
    return (
      <div className={`${card} text-center`}>
        <h1 className="font-display text-[24px] font-extrabold">Thanks for letting us know</h1>
        <p className="mt-1 text-[14px] font-semibold text-muted">We&apos;ve noted your decision. If anything changes, we&apos;re happy to help.</p>
      </div>
    );
  }
  if (done === "accepted") {
    const c = agreed ?? p.choice;
    return (
      <div className={`${card} text-center`} data-testid="accepted">
        <CircleCheck className="mx-auto mb-2 text-good" size={40} aria-hidden />
        <h1 className="font-display text-[26px] font-extrabold">You&apos;re all set, {p.firstName}!</h1>
        <p className="mx-auto mt-1 max-w-[460px] text-[14px] font-semibold text-ink-2">
          {c
            ? `Estimate #${p.number} accepted — ${money(c.todayTotal)} for today's service${c.joinedPlan ? `, and you're enrolled in ${p.planName} (${money(c.billingAmount)} every ${c.billingMonths} months).` : "."}`
            : "We've received your acceptance."}{" "}
          We&apos;ll be in touch shortly to schedule.
        </p>
      </div>
    );
  }

  /* ---------- the estimate ---------- */
  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <div className="text-[11px] font-extrabold tracking-[1px] text-muted">ESTIMATE #{p.number}</div>
        <h1 className="mt-0.5 font-display text-[26px] leading-tight font-extrabold">Hi {p.firstName}, here&apos;s your estimate</h1>
        {p.address && <div className="mt-1 text-[13.5px] font-semibold text-muted">{p.address}</div>}
        <a
          href={`/e/${p.token}/document`}
          target="_blank"
          rel="noreferrer"
          className={`mt-2 inline-block text-[12.5px] font-extrabold text-blue hover:text-brand ${locked ? "pointer-events-none opacity-60" : ""}`}
        >
          Download PDF ↓
        </a>
        {p.validUntil && (
          <div className={`mt-1 text-[12.5px] font-bold ${p.expired ? "text-bad" : "text-faint"}`}>
            {p.expired ? `This estimate expired on ${p.validUntil}. Contact us for an updated one.` : `Valid until ${p.validUntil}`}
          </div>
        )}

        <ul className="mt-4 divide-y divide-line-soft">
          {p.lines.map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2.5">
              <div>
                <div className="text-[14px] font-extrabold text-ink">{l.name}</div>
                <div className="text-[12px] font-semibold text-muted">
                  {describeLine(l)}
                  {l.description && ` · ${l.description}`}
                </div>
              </div>
              <div className="text-[14px] font-extrabold whitespace-nowrap text-ink">{money(lineTotal(l))}</div>
            </li>
          ))}
        </ul>
        {p.notes && <p className="mt-3 rounded-xl bg-field px-3 py-2.5 text-[13px] font-semibold whitespace-pre-line text-ink-2">{p.notes}</p>}
      </div>

      {p.planOffered && (
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How would you like to go ahead?">
          <ChoiceCard
            active={mode === "one"}
            onClick={() => setMode("one")}
            title="One-time service"
            price={money(oneTime.today)}
            sub="Just today's cleaning."
          />
          <ChoiceCard
            active={mode === "plan"}
            onClick={() => setMode("plan")}
            title={`Join ${p.planName}`}
            price={withPlan ? money(withPlan.today) : "Pick services"}
            sub={withPlan ? `Save ${money(withPlan.discount)} today (${withPlan.discountPct}% off) + regular upkeep` : "Choose what we maintain below"}
            badge={withPlan ? `SAVE ${withPlan.discountPct}%` : undefined}
          />
        </div>
      )}

      {p.planOffered && mode === "plan" && (
        <div className={card}>
          <h2 className="font-display text-[20px] font-extrabold">Build your plan</h2>
          <p className="mb-3 text-[13px] font-semibold text-muted">Choose what we keep clean and how often. Your price updates as you go.</p>
          <ul className="space-y-2">
            {p.planItems.map((it, k) => (
              <li
                key={k}
                className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${picked[k] ? "border-brand bg-[#FFF7F0]" : "border-line bg-surface"}`}
              >
                <label className="flex min-w-[160px] flex-1 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="size-[18px] accent-brand"
                    checked={picked[k]}
                    disabled={!canAct}
                    onChange={(e) => setPicked((ps) => ps.map((v, j) => (j === k ? e.target.checked : v)))}
                  />
                  <span>
                    <span className="block text-[14px] font-extrabold text-ink">{it.name}</span>
                    <span className="block text-[12px] font-semibold text-muted">{money(it.perVisit)} per visit</span>
                  </span>
                </label>
                <select
                  aria-label={`How often for ${it.name}`}
                  value={freq[k]}
                  disabled={!canAct || !picked[k]}
                  onChange={(e) => setFreq((fs) => fs.map((v, j) => (j === k ? (e.target.value as Frequency) : v)))}
                  className="rounded-lg border border-line-field bg-surface px-2.5 py-2 text-[13px] font-bold text-ink disabled:opacity-50"
                >
                  {allowed.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>

          {withPlan?.plan ? (
            <div className="mt-4 rounded-xl bg-gradient-to-br from-navy to-[#16406B] p-4 text-white">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-[#CDDDEE]">Plan price</span>
                <span className="font-display text-[24px] font-extrabold text-[#F9A03F]" data-testid="customer-plan-billing">
                  {money(withPlan.plan.billingAmount)}{" "}
                  <span className="text-[14px] text-[#CDDDEE]">every {withPlan.plan.billingMonths === 1 ? "month" : `${withPlan.plan.billingMonths} months`}</span>
                </span>
              </div>
              <div className="mt-1 text-[12.5px] font-semibold text-[#9FB8D0]">
                First plan visit and bill: {p.monthNames[withPlan.plan.billingMonths]}
                {p.terms.commitmentMonths ? ` · ${p.terms.commitmentMonths}-month minimum` : ""}
              </div>
              <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-[12.5px] font-semibold text-[#CDDDEE]">
                {withPlan.plan.visits.map((v) => (
                  <li key={v.month} className="flex gap-2">
                    <span className="w-[120px] shrink-0 font-extrabold text-white">{p.monthNames[v.month]}</span>
                    <span>{v.items.join(", ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-[13px] font-bold text-warn">Tick at least one service to build your plan.</p>
          )}
        </div>
      )}

      <div className={card}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-extrabold text-ink">Today you pay</span>
          <span className="font-display text-[30px] font-extrabold text-ink" data-testid="customer-today">
            {money(shown.today)}
          </span>
        </div>
        {planActive && (
          <div className="text-right text-[13px] font-bold text-good">
            {money(shown.subtotal)} − {shown.discountPct}% plan savings ({money(shown.discount)})
          </div>
        )}

        {canAct && !declining && (
          <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-extrabold text-ink-2">Type your full name to accept</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="w-full rounded-[10px] border border-line-field px-3 py-2.5 text-[14px] font-semibold"
              />
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-[12.5px] font-semibold text-ink-2">
              <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                I accept this estimate
                {planActive
                  ? ` and enroll in ${p.planName}: ${money(withPlan!.plan!.billingAmount)} billed every ${withPlan!.plan!.billingMonths === 1 ? "month" : `${withPlan!.plan!.billingMonths} months`}${p.terms.commitmentMonths ? `, minimum ${p.terms.commitmentMonths} months` : ""}`
                  : ""}
                .
              </span>
            </label>
            {error && (
              <div role="alert" className="rounded-[10px] bg-bad-tint px-3 py-2.5 text-[13px] font-bold text-bad">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={accept}
              disabled={locked || pending || name.trim().length < 2 || !agree || (mode === "plan" && !planActive)}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-hi to-brand py-3 text-[15px] font-extrabold text-white shadow-[var(--shadow-brand)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check size={18} aria-hidden /> {pending ? "Accepting…" : planActive ? "Accept & join the plan" : "Accept estimate"}
            </button>
            {locked && (
              <p className="text-center text-[12px] font-bold text-warn">Preview — accepting and declining are turned off.</p>
            )}
            <button type="button" disabled={locked} onClick={() => setDeclining(true)} className="w-full cursor-pointer text-[12.5px] font-bold text-muted underline hover:text-ink disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50">
              No thanks, decline this estimate
            </button>
          </div>
        )}

        {canAct && declining && (
          <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-extrabold text-ink-2">Mind telling us why? (optional)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-[10px] border border-line-field px-3 py-2 text-[13.5px] font-semibold" />
            </label>
            {error && <div role="alert" className="rounded-[10px] bg-bad-tint px-3 py-2.5 text-[13px] font-bold text-bad">{error}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeclining(false)} className="flex-1 cursor-pointer rounded-xl border border-line-field py-2.5 text-[13.5px] font-extrabold text-ink hover:bg-hover">
                Back
              </button>
              <button type="button" onClick={decline} disabled={pending} className="flex-1 cursor-pointer rounded-xl bg-ink py-2.5 text-[13.5px] font-extrabold text-white disabled:opacity-50">
                {pending ? "Sending…" : "Decline estimate"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  onClick,
  title,
  price,
  sub,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  price: string;
  sub: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`relative cursor-pointer rounded-2xl border-2 bg-surface p-4 text-left shadow-sm transition ${
        active ? "border-brand bg-[#FFF7F0]" : "border-line hover:border-line-field"
      }`}
    >
      {badge && <span className="absolute top-3 right-3 rounded-full bg-good px-2 py-0.5 text-[10.5px] font-extrabold text-white">{badge}</span>}
      <div className="text-[13px] font-extrabold text-ink-2">{title}</div>
      <div className="mt-1 font-display text-[24px] font-extrabold text-ink">{price}</div>
      <div className="mt-0.5 text-[12px] font-semibold text-muted">{sub}</div>
    </button>
  );
}
