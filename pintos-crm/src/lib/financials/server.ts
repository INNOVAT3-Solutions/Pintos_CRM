import "server-only";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ghl, locationId } from "@/lib/ghl/client";
import { cents } from "@/lib/estimates/pricing";
import { easternParts } from "@/lib/format";

/**
 * Money, from three sources:
 *  - Work completed: jobs marked completed in the CRM (their amount).
 *  - Collected: GHL payments that succeeded (live mode, net of refunds).
 *  - Expenses: entered in the CRM.
 * Plus outstanding GHL invoices and the recurring value of active plans.
 */

export interface MonthRow {
  key: string; // YYYY-MM
  label: string; // "Nov"
  work: number;
  collected: number;
  expenses: number;
}

const monthKey = (d: Date | string) => easternParts(d).date.slice(0, 7);

function lastMonths(n: number): { key: string; label: string }[] {
  const today = easternParts(new Date()).date;
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  const out: { key: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.unshift({ key, label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`)) });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

interface RawTxn {
  amount?: number;
  amountRefunded?: number;
  status?: string;
  liveMode?: boolean;
  createdAt?: string;
}
interface RawInvoice {
  _id: string;
  invoiceNumber?: string;
  name?: string;
  status?: string;
  liveMode?: boolean;
  total?: number;
  amountDue?: number;
  dueDate?: string;
  issueDate?: string;
  contactDetails?: { id?: string; name?: string };
}

async function ghlTransactions(): Promise<RawTxn[]> {
  const out: RawTxn[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const d = await ghl<{ data?: RawTxn[]; totalCount?: number }>("/payments/transactions", {
      query: { altId: locationId(), altType: "location", limit: 100, offset },
    });
    out.push(...(d.data ?? []));
    if (!d.data?.length || out.length >= (d.totalCount ?? 0)) break;
  }
  return out;
}

async function ghlInvoices(): Promise<RawInvoice[]> {
  const out: RawInvoice[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const d = await ghl<{ invoices?: RawInvoice[]; total?: number }>("/invoices/", {
      query: { altId: locationId(), altType: "location", limit: 100, offset },
    });
    out.push(...(d.invoices ?? []));
    if (!d.invoices?.length || out.length >= (d.total ?? 0)) break;
  }
  return out;
}

export interface Financials {
  months: MonthRow[];
  thisMonth: MonthRow;
  outstanding: { id: string; number: string; customer: string; amountDue: number; dueDate: string | null; status: string }[];
  outstandingTotal: number;
  plans: { members: number; monthlyRecurring: number; billedPerYear: number };
  /** GHL data couldn't be loaded (the CRM figures still show). */
  ghlError: string | null;
}

const OPEN_INVOICE = new Set(["sent", "viewed", "partially_paid", "overdue", "payment_processing"]);

export async function getFinancials(monthsBack = 6): Promise<Financials> {
  const db = await getDb();
  const months = lastMonths(monthsBack);
  const from = `${months[0].key}-01`;

  const [jobs, expenses, accepted] = await Promise.all([
    db.select({ amount: schema.jobs.amount, completedAt: schema.jobs.completedAt }).from(schema.jobs).where(and(eq(schema.jobs.status, "completed"), isNotNull(schema.jobs.completedAt))),
    db.select({ date: schema.expenses.date, amount: schema.expenses.amount }).from(schema.expenses).where(gte(schema.expenses.date, from)),
    db.select({ choice: schema.estimates.choice, contactId: schema.estimates.contactId }).from(schema.estimates).where(eq(schema.estimates.status, "accepted")),
  ]);

  let txns: RawTxn[] = [];
  let invoices: RawInvoice[] = [];
  let ghlError: string | null = null;
  try {
    [txns, invoices] = await Promise.all([ghlTransactions(), ghlInvoices()]);
  } catch (e) {
    ghlError = e instanceof Error ? e.message : String(e);
  }

  const rows: MonthRow[] = months.map((m) => ({ ...m, work: 0, collected: 0, expenses: 0 }));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  for (const j of jobs) {
    const r = j.completedAt && byKey.get(monthKey(j.completedAt));
    if (r) r.work += j.amount;
  }
  for (const t of txns) {
    if (t.status !== "succeeded" || t.liveMode === false || !t.createdAt) continue;
    const r = byKey.get(monthKey(t.createdAt));
    if (r) r.collected += (t.amount ?? 0) - (t.amountRefunded ?? 0);
  }
  for (const e of expenses) {
    const r = byKey.get(e.date.slice(0, 7));
    if (r) r.expenses += e.amount;
  }
  for (const r of rows) {
    r.work = cents(r.work);
    r.collected = cents(r.collected);
    r.expenses = cents(r.expenses);
  }

  const outstanding = invoices
    .filter((i) => i.liveMode !== false && OPEN_INVOICE.has(i.status ?? "") && (i.amountDue ?? 0) > 0)
    .map((i) => ({
      id: i._id,
      number: i.invoiceNumber ?? "—",
      customer: i.contactDetails?.name ?? i.name ?? "—",
      amountDue: i.amountDue ?? 0,
      dueDate: i.dueDate ?? null,
      status: i.status ?? "",
    }))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  // One active plan per customer (their most recent accepted plan).
  const planByContact = new Map<string, number>();
  for (const a of accepted) {
    const c = a.choice;
    if (c?.joinedPlan && c.billingMonths) planByContact.set(a.contactId, c.billingAmount * (12 / c.billingMonths));
  }
  const perYear = [...planByContact.values()].reduce((s, v) => s + v, 0);

  return {
    months: rows,
    thisMonth: rows[rows.length - 1],
    outstanding,
    outstandingTotal: cents(outstanding.reduce((s, i) => s + i.amountDue, 0)),
    plans: { members: planByContact.size, monthlyRecurring: cents(perYear / 12), billedPerYear: cents(perYear) },
    ghlError,
  };
}
