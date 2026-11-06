/**
 * Estimate & maintenance-plan pricing. Pure functions shared by the estimate
 * builder, the customer's page and the server — the server always recomputes
 * from these before saving or writing to GHL, so a browser can't change prices.
 */
import type { EstimateLine, Frequency, PlanItem, PlanTerms, PriceUnit } from "@/lib/db/schema";

export const cents = (n: number) => Math.round(n * 100) / 100;

export const FREQUENCIES: { id: Frequency; label: string; months: number }[] = [
  { id: "monthly", label: "Every month", months: 1 },
  { id: "bimonthly", label: "Every 2 months", months: 2 },
  { id: "quarterly", label: "Every 3 months", months: 3 },
  { id: "semiannual", label: "Every 6 months", months: 6 },
  { id: "annual", label: "Once a year", months: 12 },
];
export const monthsOf = (f: Frequency) => FREQUENCIES.find((x) => x.id === f)?.months ?? 3;
export const frequencyLabel = (f: Frequency) => FREQUENCIES.find((x) => x.id === f)?.label ?? f;

export const UNIT_LABEL: Record<PriceUnit, { short: string; per: string }> = {
  sqft: { short: "sq ft", per: "/ sq ft" },
  linear_ft: { short: "linear ft", per: "/ linear ft" },
  each: { short: "", per: "each" },
  flat: { short: "", per: "flat" },
};

/** One line: quantity × unit price, never below the service minimum. Flat prices ignore quantity. */
export function lineTotal(l: Pick<EstimateLine, "unit" | "qty" | "unitPrice" | "minPrice">): number {
  const raw = l.unit === "flat" ? l.unitPrice : l.qty * l.unitPrice;
  return cents(Math.max(raw, l.minPrice || 0));
}

export function describeLine(l: Pick<EstimateLine, "unit" | "qty" | "unitPrice">): string {
  const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  if (l.unit === "flat") return "Flat rate";
  const qty = l.qty.toLocaleString("en-US");
  if (l.unit === "each") return `${qty} × ${money(l.unitPrice)}`;
  return `${qty} ${UNIT_LABEL[l.unit].short} × ${money(l.unitPrice)}`;
}

export const subtotal = (lines: EstimateLine[]) => cents(lines.reduce((s, l) => s + lineTotal(l), 0));

/** Default per-visit maintenance price for a service: the plan % of its full price. */
export const defaultPerVisit = (fullPrice: number, terms: Pick<PlanTerms, "maintenancePct">) =>
  cents((fullPrice * terms.maintenancePct) / 100);

export interface PlanQuote {
  /** Sum over items of per-visit price × visits per year. */
  annual: number;
  /** Bill as often as the most frequent service. */
  billingMonths: number;
  /** Even amount charged each billing date (never below the plan minimum). */
  billingAmount: number;
  /** Discount on today's service for joining. */
  discountPct: number;
  /** Visits over the first year: month offset from today and what's done. */
  visits: { month: number; items: string[] }[];
}

export function quotePlan(items: Pick<PlanItem, "name" | "perVisit" | "frequency">[], terms: PlanTerms): PlanQuote | null {
  if (!items.length) return null;
  const annual = cents(items.reduce((s, i) => s + i.perVisit * (12 / monthsOf(i.frequency)), 0));
  const billingMonths = Math.min(...items.map((i) => monthsOf(i.frequency)));
  const billingAmount = cents(Math.max(annual / (12 / billingMonths), terms.minPerBilling || 0));
  const discountPct = terms.tierEnabled && annual >= terms.tierMinAnnual ? terms.tierPct : terms.discountPct;

  const visits: PlanQuote["visits"] = [];
  for (let m = billingMonths; m <= 12; m += billingMonths) {
    const due = items.filter((i) => m % monthsOf(i.frequency) === 0).map((i) => i.name);
    if (due.length) visits.push({ month: m, items: due });
  }
  return { annual, billingMonths, billingAmount, discountPct, visits };
}

export interface Totals {
  subtotal: number;
  discountPct: number;
  discount: number;
  today: number;
  plan: PlanQuote | null;
}

/** What the customer pays today, with or without joining the plan. */
export function totals(lines: EstimateLine[], planItems: PlanItem[] | null, terms: PlanTerms): Totals {
  const sub = subtotal(lines);
  const plan = planItems && planItems.length ? quotePlan(planItems, terms) : null;
  const discountPct = plan ? plan.discountPct : 0;
  const discount = cents((sub * discountPct) / 100);
  return { subtotal: sub, discountPct, discount, today: cents(sub - discount), plan };
}

/** Calendar date `months` after `from`, in the business's own terms (same day of month, clamped). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}
