import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { totals } from "@/lib/estimates/pricing";
import { ago, money } from "@/lib/format";
import { Card, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Estimates" };

const TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  draft: "neutral",
  sent: "warn",
  viewed: "warn",
  accepted: "good",
  declined: "bad",
};

export default async function EstimatesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser();
  const { status } = await searchParams;
  const db = await getDb();
  const all = await db.select().from(schema.estimates).orderBy(desc(schema.estimates.createdAt)).limit(500);
  const rows = status ? all.filter((e) => e.status === status) : all;
  const ids = [...new Set(rows.map((r) => r.contactId))];
  const contacts = ids.length
    ? await db.select({ id: schema.ghlContacts.id, name: schema.ghlContacts.name }).from(schema.ghlContacts).where(inArray(schema.ghlContacts.id, ids))
    : [];
  const name = new Map(contacts.map((c) => [c.id, c.name]));
  const count = (s: string) => all.filter((e) => e.status === s).length;
  const filters = [
    { key: "", label: "All", n: all.length },
    { key: "draft", label: "Drafts", n: count("draft") },
    { key: "sent", label: "Sent", n: count("sent") },
    { key: "viewed", label: "Opened", n: count("viewed") },
    { key: "accepted", label: "Accepted", n: count("accepted") },
    { key: "declined", label: "Declined", n: count("declined") },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-11 md:px-7">
      <PageHeader
        title="Estimates"
        subtitle="Build, send and track estimates — with optional maintenance plans."
        actions={
          <Link
            href="/estimates/new"
            className="rounded-[10px] bg-gradient-to-b from-brand-hi to-brand px-4 py-[9px] text-[13px] font-extrabold text-white shadow-[var(--shadow-brand)] hover:brightness-105"
          >
            + New estimate
          </Link>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/estimates?status=${f.key}` : "/estimates"}
            className={`rounded-full border px-[15px] py-1.5 text-[12px] font-extrabold ${
              (status ?? "") === f.key ? "border-ink bg-ink text-white" : "border-line-field bg-surface text-ink-2 hover:bg-hover"
            }`}
          >
            {f.label} <span className="opacity-60">{f.n}</span>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <p className="text-[13.5px] font-semibold text-muted">
            No estimates here yet. <Link href="/estimates/new" className="font-extrabold text-blue hover:text-brand">Create one</Link> — or start from a
            customer&apos;s profile.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="hidden grid-cols-[70px_2fr_0.9fr_1fr_1.2fr_1fr] gap-2.5 border-b border-line bg-[#F8FAFD] px-5 py-3 text-[10.5px] font-extrabold tracking-[1.2px] text-[#8AA0B8] md:grid">
            <div>#</div>
            <div>CUSTOMER</div>
            <div>STATUS</div>
            <div>ONE-TIME</div>
            <div>PLAN</div>
            <div>UPDATED</div>
          </div>
          {rows.map((e) => {
            const t = totals(e.lines, null, e.terms);
            const planFrom = e.choice?.joinedPlan
              ? `${money(e.choice.billingAmount)} / ${e.choice.billingMonths} mo`
              : e.planOffered
                ? "Offered"
                : "—";
            return (
              <Link
                key={e.id}
                href={`/estimates/${e.id}`}
                className="grid grid-cols-[1fr_auto] items-center gap-2.5 border-b border-[#F0F4F9] px-4 py-3.5 last:border-0 hover:bg-[#F8FAFD] md:grid-cols-[70px_2fr_0.9fr_1fr_1.2fr_1fr] md:px-5"
              >
                <div className="hidden text-[12.5px] font-extrabold text-blue md:block">#{e.number}</div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-extrabold text-ink">{name.get(e.contactId) ?? "Removed customer"}</div>
                  <div className="truncate text-[12px] font-semibold text-[#8AA0B8]">
                    <span className="md:hidden">#{e.number} · </span>
                    {e.propertyAddress ?? `${e.lines.length} service${e.lines.length === 1 ? "" : "s"}`}
                  </div>
                </div>
                <div className="text-right md:text-left">
                  <Pill tone={TONE[e.status] ?? "neutral"}>{e.status === "viewed" ? "opened" : e.status}</Pill>
                  {e.ghlError && <div className="mt-0.5 text-[10.5px] font-bold text-warn">GHL needs attention</div>}
                </div>
                <div className="hidden text-[13.5px] font-extrabold text-ink md:block">
                  {money(e.choice ? e.choice.todayTotal : t.today)}
                </div>
                <div className="hidden text-[12.5px] font-bold text-ink-2 md:block">{planFrom}</div>
                <div className="hidden text-[12.5px] font-semibold text-muted md:block">{ago(e.updatedAt)}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
