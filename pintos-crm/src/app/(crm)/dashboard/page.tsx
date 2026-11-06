import Link from "next/link";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { calendarLabel, listCalendars, listEvents } from "@/lib/ghl/calendars";
import { getFinancials } from "@/lib/financials/server";
import { ensureFresh } from "@/lib/sync";
import { subtotal } from "@/lib/estimates/pricing";
import { ago, easternIso, easternParts, fmtDate, fmtTime, money, startOfMonthEastern } from "@/lib/format";
import { Card, Pill, SectionLabel } from "@/components/ui";

export const metadata = { title: "Dashboard" };

function greeting() {
  const h = Number(easternParts(new Date()).time.slice(0, 2));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const me = await requireUser();
  const sync = await ensureFresh().catch(() => null);
  const db = await getDb();
  const monthStart = startOfMonthEastern();
  const today = easternParts(new Date()).date;
  const fortnightAgo = new Date(Date.now() - 14 * 86_400_000);

  const [fin, openDeals, estimatesThisMonth, waiting, toSchedule, problemsE, problemsJ, newLeads, calendars, todays] = await Promise.all([
    getFinancials(1),
    db.select({ value: schema.ghlOpportunities.value }).from(schema.ghlOpportunities).where(eq(schema.ghlOpportunities.status, "open")),
    db.select().from(schema.estimates).where(and(isNotNull(schema.estimates.sentAt), gte(schema.estimates.sentAt, monthStart))),
    db.select().from(schema.estimates).where(inArray(schema.estimates.status, ["sent", "viewed"])).orderBy(schema.estimates.sentAt).limit(6),
    db.select().from(schema.jobs).where(eq(schema.jobs.status, "to_schedule")).orderBy(schema.jobs.dueDate).limit(6),
    db.select({ id: schema.estimates.id, number: schema.estimates.number, err: schema.estimates.ghlError }).from(schema.estimates).where(isNotNull(schema.estimates.ghlError)).limit(5),
    db.select({ id: schema.jobs.id, number: schema.jobs.number, err: schema.jobs.ghlError }).from(schema.jobs).where(isNotNull(schema.jobs.ghlError)).limit(5),
    db.select().from(schema.ghlContacts).where(gte(schema.ghlContacts.dateAdded, fortnightAgo)).orderBy(desc(schema.ghlContacts.dateAdded)).limit(6),
    listCalendars().catch(() => []),
    listEvents(new Date(easternIso(today, "00:00")), new Date(easternIso(today, "23:59"))).catch(() => null),
  ]);

  const ids = [...new Set([...waiting.map((e) => e.contactId), ...toSchedule.map((j) => j.contactId), ...(todays ?? []).map((e) => e.contactId).filter((x): x is string => !!x)])];
  const contacts = ids.length ? await db.select({ id: schema.ghlContacts.id, name: schema.ghlContacts.name }).from(schema.ghlContacts).where(inArray(schema.ghlContacts.id, ids)) : [];
  const name = new Map(contacts.map((c) => [c.id, c.name]));
  const calName = new Map(calendars.map((c) => [c.id, calendarLabel(c.name)]));

  const accepted = estimatesThisMonth.filter((e) => e.status === "accepted").length;
  const decided = estimatesThisMonth.filter((e) => e.status === "accepted" || e.status === "declined").length;
  const m = fin.thisMonth;
  const pipeline = openDeals.reduce((s, d) => s + d.value, 0);

  const kpis = [
    { label: "Work completed", value: money(m.work), sub: `${m.label} · jobs marked done` },
    { label: "Collected", value: money(m.collected), sub: `${m.label} · paid in GHL` },
    { label: "Open pipeline", value: money(pipeline), sub: `${openDeals.length} open deal${openDeals.length === 1 ? "" : "s"}` },
    { label: "Estimates sent", value: String(estimatesThisMonth.length), sub: decided ? `${accepted} accepted (${Math.round((accepted / decided) * 100)}% of decided)` : `${accepted} accepted so far` },
    { label: "Plan revenue / month", value: money(fin.plans.monthlyRecurring), sub: `${fin.plans.members} plan member${fin.plans.members === 1 ? "" : "s"}` },
  ];
  const problems = [
    ...problemsE.map((p) => ({ href: `/estimates/${p.id}`, label: `Estimate #${p.number}`, err: p.err })),
    ...problemsJ.map((p) => ({ href: `/jobs/${p.id}`, label: `Job #${p.number}`, err: p.err })),
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-[26px] pb-11 md:px-7">
      <div className="mb-5">
        <h1 className="font-display text-[27px] font-extrabold tracking-[-0.3px] text-ink">
          {greeting()}, {me.name.split(" ")[0]}.
        </h1>
        <div className="mt-0.5 text-[13.5px] font-semibold text-muted">
          Here&apos;s how Pinto&apos;s is doing this month.
          {sync?.lastError && <span className="ml-2 text-warn">GHL sync problem — some numbers may be out of date.</span>}
        </div>
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-surface px-[18px] py-4 shadow-[var(--shadow-card)]">
            <div className="text-[11px] font-extrabold tracking-[1px] text-muted uppercase">{k.label}</div>
            <div className="mt-1.5 font-display text-[26px] font-extrabold text-ink">{k.value}</div>
            <div className="text-[11.5px] font-semibold text-faint">{k.sub}</div>
          </div>
        ))}
      </div>

      {problems.length > 0 && (
        <div role="status" className="mb-3.5 rounded-2xl border border-warn/30 bg-warn-tint px-4 py-3">
          <div className="mb-1 text-[13px] font-extrabold text-warn">Needs attention in GHL</div>
          <ul className="space-y-0.5">
            {problems.map((p) => (
              <li key={p.href} className="text-[12.5px] font-semibold text-ink-2">
                <Link href={p.href} className="font-extrabold text-blue hover:text-brand">
                  {p.label}
                </Link>{" "}
                — {p.err}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid items-start gap-3.5 lg:grid-cols-3">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[15px] font-extrabold">Today</div>
            <Link href="/calendar" className="text-[12px] font-extrabold text-blue hover:text-brand">
              Calendar →
            </Link>
          </div>
          {todays === null ? (
            <p className="text-[12.5px] font-semibold text-bad">Couldn&apos;t load today&apos;s calendar from GHL.</p>
          ) : todays.filter((e) => e.status !== "cancelled").length === 0 ? (
            <p className="text-[12.5px] font-semibold text-faint">Nothing on the calendar today.</p>
          ) : (
            <ul>
              {todays
                .filter((e) => e.status !== "cancelled")
                .map((e) => (
                  <li key={e.id} className="border-b border-line-soft py-2 last:border-0">
                    <div className="text-[11.5px] font-extrabold text-muted">
                      {fmtTime(e.start)} – {fmtTime(e.end)} · {calName.get(e.calendarId) ?? ""}
                    </div>
                    <div className="text-[13.5px] font-extrabold text-ink">{(e.contactId && name.get(e.contactId)) || e.title}</div>
                    {e.address && <div className="truncate text-[12px] font-semibold text-muted">{e.address}</div>}
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[15px] font-extrabold">Waiting on you</div>
            <Link href="/jobs" className="text-[12px] font-extrabold text-blue hover:text-brand">
              Jobs →
            </Link>
          </div>
          <SectionLabel>Jobs to schedule</SectionLabel>
          {toSchedule.length === 0 ? (
            <p className="mt-1 mb-3 text-[12.5px] font-semibold text-faint">All scheduled.</p>
          ) : (
            <ul className="mt-1 mb-3">
              {toSchedule.map((j) => (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="flex justify-between gap-2 border-b border-line-soft py-1.5 last:border-0 hover:bg-hover">
                    <span className="min-w-0 truncate text-[13px] font-bold text-ink">{name.get(j.contactId) ?? "Customer"} · {j.kind === "plan_visit" ? "plan visit" : j.title}</span>
                    <span className="text-[11.5px] font-bold whitespace-nowrap text-warn">{j.dueDate ? `due ${fmtDate(`${j.dueDate}T12:00:00`)}` : "new"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <SectionLabel>Estimates awaiting the customer</SectionLabel>
          {waiting.length === 0 ? (
            <p className="mt-1 text-[12.5px] font-semibold text-faint">None outstanding.</p>
          ) : (
            <ul className="mt-1">
              {waiting.map((e) => (
                <li key={e.id}>
                  <Link href={`/estimates/${e.id}`} className="flex justify-between gap-2 border-b border-line-soft py-1.5 last:border-0 hover:bg-hover">
                    <span className="min-w-0 truncate text-[13px] font-bold text-ink">
                      #{e.number} · {name.get(e.contactId) ?? "Customer"} · {money(subtotal(e.lines))}
                    </span>
                    <span className="text-[11.5px] font-bold whitespace-nowrap text-muted">
                      {e.status === "viewed" ? "opened" : "sent"} {ago(e.viewedAt ?? e.sentAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[15px] font-extrabold">New leads</div>
            <Link href="/customers?filter=new" className="text-[12px] font-extrabold text-blue hover:text-brand">
              Customers →
            </Link>
          </div>
          {newLeads.length === 0 ? (
            <p className="text-[12.5px] font-semibold text-faint">No new contacts in the last 2 weeks.</p>
          ) : (
            <ul>
              {newLeads.map((c) => (
                <li key={c.id}>
                  <Link href={`/customers/${c.id}`} className="block border-b border-line-soft py-2 last:border-0 hover:bg-hover">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-[13.5px] font-extrabold text-ink">{c.name}</span>
                      <span className="text-[11.5px] font-bold whitespace-nowrap text-muted">{ago(c.dateAdded)}</span>
                    </div>
                    <div className="truncate text-[12px] font-semibold text-muted">
                      {c.source ?? "—"}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2">
            <Pill tone="neutral">Synced {ago(sync?.lastSyncAt ?? null)}</Pill>
          </div>
        </Card>
      </div>
    </div>
  );
}
