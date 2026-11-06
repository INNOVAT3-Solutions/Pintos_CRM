import { desc, gte } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getFinancials } from "@/lib/financials/server";
import { fmtDate, money } from "@/lib/format";
import { Card, PageHeader, SectionLabel } from "@/components/ui";
import { ExpenseForm, DeleteExpense } from "./expenses";
import { MonthlyChart } from "./monthly-chart";

export const metadata = { title: "Financials" };

export default async function FinancialsPage() {
  await requireUser();
  const f = await getFinancials(6);
  const db = await getDb();
  const recent = await db
    .select()
    .from(schema.expenses)
    .where(gte(schema.expenses.date, `${f.months[0].key}-01`))
    .orderBy(desc(schema.expenses.date), desc(schema.expenses.createdAt))
    .limit(50);
  const m = f.thisMonth;

  const tiles = [
    { label: `Work completed · ${m.label}`, value: money(m.work), hint: "Jobs marked completed" },
    { label: `Collected · ${m.label}`, value: money(m.collected), hint: "Payments received in GHL" },
    { label: `Expenses · ${m.label}`, value: money(m.expenses), hint: "Entered below" },
    { label: "Work − expenses", value: money(m.work - m.expenses), hint: "This month" },
    { label: "Outstanding invoices", value: money(f.outstandingTotal), hint: `${f.outstanding.length} unpaid in GHL` },
    { label: "Plan revenue / month", value: money(f.plans.monthlyRecurring), hint: `${f.plans.members} plan member${f.plans.members === 1 ? "" : "s"}` },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-11 md:px-7">
      <PageHeader title="Financials" subtitle="Work completed and expenses from the CRM; payments and invoices from GHL." />
      {f.ghlError && (
        <div role="status" className="mb-3 rounded-xl bg-warn-tint px-4 py-3 text-[13px] font-bold text-warn">
          Couldn&apos;t load GHL payments/invoices ({f.ghlError}). CRM figures are still shown.
        </div>
      )}

      <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[14px] border border-line bg-surface px-4 py-3.5 shadow-sm">
            <div className="text-[10.5px] font-extrabold tracking-[0.8px] text-[#8AA0B8] uppercase">{t.label}</div>
            <div className="mt-1 font-display text-[22px] font-extrabold text-ink">{t.value}</div>
            <div className="text-[11.5px] font-semibold text-faint">{t.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-3.5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-1 text-[15px] font-extrabold">Last 6 months</div>
          <MonthlyChart rows={f.months} />
        </Card>

        <div className="flex flex-col gap-3.5">
          <Card>
            <SectionLabel>Add an expense</SectionLabel>
            <ExpenseForm />
          </Card>
          <Card>
            <SectionLabel>Unpaid invoices (GHL)</SectionLabel>
            {f.outstanding.length === 0 ? (
              <p className="mt-2 text-[12.5px] font-semibold text-faint">Nothing outstanding.</p>
            ) : (
              <ul className="mt-2">
                {f.outstanding.slice(0, 8).map((i) => (
                  <li key={i.id} className="flex items-baseline justify-between gap-2 border-b border-line-soft py-2 last:border-0">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-extrabold text-ink">{i.customer}</span>
                      <span className="block text-[11px] font-bold text-faint">
                        #{i.number} · {i.status.replace("_", " ")}
                        {i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ""}
                      </span>
                    </span>
                    <span className="text-[13px] font-extrabold whitespace-nowrap text-ink">{money(i.amountDue)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-3.5">
        <SectionLabel>Expenses — last 6 months</SectionLabel>
        {recent.length === 0 ? (
          <p className="mt-2 text-[12.5px] font-semibold text-faint">No expenses recorded yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-[10.5px] font-extrabold tracking-[0.8px] text-muted uppercase">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Paid to</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Added by</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id} className="border-b border-line-soft last:border-0">
                    <td className="py-2 pr-3 font-semibold text-ink-2">{fmtDate(`${e.date}T12:00:00`)}</td>
                    <td className="py-2 pr-3 font-extrabold text-ink">
                      {e.vendor}
                      {e.notes && <span className="block text-[11.5px] font-semibold text-muted">{e.notes}</span>}
                    </td>
                    <td className="py-2 pr-3 font-semibold text-ink-2">{e.category}</td>
                    <td className="py-2 pr-3 text-right font-extrabold text-ink">{money(e.amount)}</td>
                    <td className="py-2 pr-3 font-semibold text-muted">{e.staffName}</td>
                    <td className="py-2 text-right">
                      <DeleteExpense id={e.id} label={`${e.vendor} ${money(e.amount)}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
