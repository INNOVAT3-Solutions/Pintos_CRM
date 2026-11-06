import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { calendarLabel, listCalendars } from "@/lib/ghl/calendars";
import { easternParts, fmtDate, fmtDateTime, money } from "@/lib/format";
import { frequencyLabel } from "@/lib/estimates/pricing";
import { Card, PageHeader, Pill, SectionLabel } from "@/components/ui";
import { JobControls } from "./job-controls";
import { TextComposer } from "@/components/text-composer";

export const metadata = { title: "Job" };

const TONE = { to_schedule: "warn", scheduled: "neutral", in_progress: "warn", completed: "good", cancelled: "bad" } as const;
const LABEL = { to_schedule: "To schedule", scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" } as const;

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job) notFound();

  const [[contact], users, calendars, estimate] = await Promise.all([
    db.select().from(schema.ghlContacts).where(eq(schema.ghlContacts.id, job.contactId)),
    db.select().from(schema.ghlUsers),
    listCalendars().catch(() => []),
    job.estimateId
      ? db.select({ id: schema.estimates.id, number: schema.estimates.number }).from(schema.estimates).where(eq(schema.estimates.id, job.estimateId)).then((r) => r[0])
      : Promise.resolve(undefined),
  ]);

  const when = job.scheduledStart ? easternParts(job.scheduledStart) : null;
  const hours = job.scheduledStart && job.scheduledEnd ? (job.scheduledEnd.getTime() - job.scheduledStart.getTime()) / 3600_000 : 3;
  const mapsUrl = job.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}` : null;

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-6 pb-11 md:px-7">
      <Link href="/jobs" className="text-[12.5px] font-extrabold text-blue hover:text-brand">
        ← Jobs
      </Link>
      <div className="mt-2.5">
        <PageHeader
          title={`Job #${job.number}`}
          subtitle={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Pill tone={TONE[job.status]}>{LABEL[job.status]}</Pill>
              {job.kind === "plan_visit" && <Pill tone="neutral">Plan visit</Pill>}
              {contact && (
                <Link href={`/customers/${contact.id}`} className="font-extrabold text-blue hover:text-brand">
                  {contact.name}
                </Link>
              )}
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue hover:text-brand">
                  <MapPin size={13} aria-hidden /> {job.address}
                </a>
              )}
              {estimate && (
                <Link href={`/estimates/${estimate.id}`} className="text-blue hover:text-brand">
                  From estimate #{estimate.number}
                </Link>
              )}
            </div>
          }
        />
      </div>

      {job.ghlError && (
        <div role="status" className="mb-3 rounded-xl bg-warn-tint px-4 py-3 text-[13px] font-bold text-warn">
          Needs attention in GHL: {job.ghlError}
        </div>
      )}

      <div className="grid items-start gap-3.5 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <div className="text-[15px] font-extrabold">{job.title}</div>
              <div className="text-[15px] font-extrabold text-ink">{job.amount ? money(job.amount) : "Covered by plan"}</div>
            </div>
            <ul>
              {job.services.map((s, i) => (
                <li key={i} className="border-b border-line-soft py-2 last:border-0">
                  <div className="text-[13.5px] font-extrabold text-ink">{s.name}</div>
                  {s.detail && <div className="text-[12px] font-semibold text-muted">{s.detail}</div>}
                </li>
              ))}
            </ul>
            {job.planVisit && (
              <div className="mt-3 rounded-xl bg-field px-3 py-2.5 text-[12.5px] font-semibold text-ink-2">
                Plan visit {job.dueDate ? `due ${fmtDate(`${job.dueDate}T12:00:00`)}` : ""} · plan includes{" "}
                {job.planVisit.items.map((i) => `${i.name} (${frequencyLabel(i.frequency).toLowerCase()})`).join(", ")}
              </div>
            )}
          </Card>
          <JobControls
            job={{
              id: job.id,
              status: job.status,
              checklist: job.checklist,
              notes: job.notes,
              calendarId: job.calendarId,
              assignedUserId: job.assignedUserId,
              date: when?.date ?? job.dueDate ?? "",
              time: when?.time ?? "09:00",
              hours,
            }}
            calendars={calendars.map((c) => ({ id: c.id, name: calendarLabel(c.name), isActive: c.isActive, team: c.team }))}
            users={users.map((u) => ({ id: u.id, name: u.name }))}
            part="work"
          />
        </div>

        <div className="flex flex-col gap-3.5">
          <Card>
            <SectionLabel>Schedule</SectionLabel>
            {job.scheduledStart && (
              <div className="mt-1 mb-2 text-[15px] font-extrabold text-ink">
                {fmtDateTime(job.scheduledStart)} · {hours} h
                <div className="text-[12px] font-semibold text-muted">
                  {calendarLabel(calendars.find((c) => c.id === job.calendarId)?.name ?? "")}
                  {job.assignedUserId && ` · ${users.find((u) => u.id === job.assignedUserId)?.name ?? ""}`}
                </div>
              </div>
            )}
            <JobControls
              job={{
                id: job.id,
                status: job.status,
                checklist: job.checklist,
                notes: job.notes,
                calendarId: job.calendarId,
                assignedUserId: job.assignedUserId,
                date: when?.date ?? job.dueDate ?? "",
                time: when?.time ?? "09:00",
                hours,
              }}
              calendars={calendars.map((c) => ({ id: c.id, name: calendarLabel(c.name), isActive: c.isActive, team: c.team }))}
              users={users.map((u) => ({ id: u.id, name: u.name }))}
              part="schedule"
            />
          </Card>
          {contact && job.status !== "cancelled" && (
            <TextComposer
              contactId={contact.id}
              firstName={contact.firstName || contact.name.split(" ")[0]}
              phone={contact.phone}
              dnd={contact.dnd}
              when={job.scheduledStart ? fmtDateTime(job.scheduledStart) : null}
              jobNumber={job.number}
              templates={job.status === "completed" ? ["done", "review"] : ["onmyway", "reminder", "late", "done"]}
            />
          )}
          {job.completedAt && (
            <Card>
              <SectionLabel>Completed</SectionLabel>
              <div className="mt-1 text-[13.5px] font-bold text-ink">
                {fmtDateTime(job.completedAt)} by {job.completedBy}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
