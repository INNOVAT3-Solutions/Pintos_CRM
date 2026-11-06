import Link from "next/link";
import { asc, desc, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import type { Job, JobStatus } from "@/lib/db/schema";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { Card, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Jobs" };

const TABS: { key: JobStatus; label: string }[] = [
  { key: "to_schedule", label: "To schedule" },
  { key: "scheduled", label: "Scheduled" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const status = (TABS.find((t) => t.key === sp.status)?.key ?? "to_schedule") as JobStatus;
  const db = await getDb();
  const all = await db.select().from(schema.jobs).orderBy(asc(schema.jobs.scheduledStart), desc(schema.jobs.createdAt));
  const rows = all
    .filter((j) => j.status === status)
    .sort((a, b) =>
      status === "to_schedule"
        ? (a.dueDate ?? "0000").localeCompare(b.dueDate ?? "0000") // due soonest first; one-off jobs (no due date) on top
        : status === "completed"
          ? (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
          : (a.scheduledStart?.getTime() ?? 0) - (b.scheduledStart?.getTime() ?? 0),
    );
  const contactIds = [...new Set(rows.map((r) => r.contactId))];
  const [contacts, users] = await Promise.all([
    contactIds.length
      ? db.select({ id: schema.ghlContacts.id, name: schema.ghlContacts.name }).from(schema.ghlContacts).where(inArray(schema.ghlContacts.id, contactIds))
      : Promise.resolve([]),
    db.select().from(schema.ghlUsers),
  ]);
  const cname = new Map(contacts.map((c) => [c.id, c.name]));
  const uname = new Map(users.map((u) => [u.id, u.name]));
  const count = (s: JobStatus) => all.filter((j) => j.status === s).length;

  const when = (j: Job) =>
    j.scheduledStart ? fmtDateTime(j.scheduledStart) : j.completedAt ? `Done ${fmtDate(j.completedAt)}` : j.dueDate ? `Due ${fmtDate(`${j.dueDate}T12:00:00`)}` : "Not scheduled";

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-11 md:px-7">
      <PageHeader
        title="Jobs"
        subtitle="Accepted estimates and plan visits become jobs here. Scheduling a job books it on the GHL calendar."
        actions={
          <Link href="/jobs/new" className="rounded-[10px] border border-line-field bg-surface px-4 py-[9px] text-[13px] font-extrabold text-ink shadow-sm hover:bg-field">
            + New job
          </Link>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs?status=${t.key}`}
            className={`rounded-full border px-[15px] py-1.5 text-[12px] font-extrabold ${
              status === t.key ? "border-ink bg-ink text-white" : "border-line-field bg-surface text-ink-2 hover:bg-hover"
            }`}
          >
            {t.label} <span className="opacity-60">{count(t.key)}</span>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <p className="text-[13.5px] font-semibold text-muted">
            Nothing here. {status === "to_schedule" ? "Accepted estimates show up here, ready to schedule." : ""}
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="hidden grid-cols-[70px_2fr_1.3fr_1fr_0.8fr] gap-2.5 border-b border-line bg-[#F8FAFD] px-5 py-3 text-[10.5px] font-extrabold tracking-[1.2px] text-[#8AA0B8] md:grid">
            <div>JOB</div>
            <div>CUSTOMER · WORK</div>
            <div>WHEN</div>
            <div>CREW</div>
            <div>AMOUNT</div>
          </div>
          {rows.map((j) => (
            <Link
              key={j.id}
              href={`/jobs/${j.id}`}
              className="grid grid-cols-[1fr_auto] items-center gap-2.5 border-b border-[#F0F4F9] px-4 py-3.5 last:border-0 hover:bg-[#F8FAFD] md:grid-cols-[70px_2fr_1.3fr_1fr_0.8fr] md:px-5"
            >
              <div className="hidden text-[12.5px] font-extrabold text-blue md:block">#{j.number}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate text-[14px] font-extrabold text-ink">
                  {cname.get(j.contactId) ?? "Removed customer"}
                  {j.kind === "plan_visit" && <Pill tone="neutral">Plan visit</Pill>}
                </div>
                <div className="truncate text-[12px] font-semibold text-[#8AA0B8]">{j.title}</div>
              </div>
              <div className="text-right text-[12.5px] font-bold text-ink-2 md:text-left">
                {when(j)}
                {j.ghlError && <div className="text-[10.5px] font-bold text-warn">GHL needs attention</div>}
              </div>
              <div className="hidden text-[12.5px] font-semibold text-muted md:block">{j.assignedUserId ? uname.get(j.assignedUserId) ?? "—" : "—"}</div>
              <div className="hidden text-[13px] font-extrabold text-ink md:block">{j.amount ? money(j.amount) : "Plan"}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
