import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { calendarLabel, listCalendars, listEvents, type CalendarEvent } from "@/lib/ghl/calendars";
import { easternIso, easternParts, fmtDate, fmtTime } from "@/lib/format";
import { Card, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Calendar" };

const COLORS = ["#1B6FAE", "#F26F1F", "#6D4BA6", "#1F8A5B", "#B7791F", "#C53030"];

/** Monday of the week containing `date` (YYYY-MM-DD, Miami calendar). */
function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireUser();
  const { week } = await searchParams;
  const today = easternParts(new Date()).date;
  const monday = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  let events: CalendarEvent[] = [];
  let calendars: Awaited<ReturnType<typeof listCalendars>> = [];
  let error = "";
  try {
    calendars = await listCalendars();
    events = await listEvents(new Date(easternIso(monday, "00:00")), new Date(easternIso(addDays(monday, 7), "00:00")));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const db = await getDb();
  const apptIds = events.map((e) => e.id);
  const contactIds = [...new Set(events.map((e) => e.contactId).filter((x): x is string => !!x))];
  const [jobs, contacts, users, unscheduled] = await Promise.all([
    apptIds.length ? db.select().from(schema.jobs).where(inArray(schema.jobs.appointmentId, apptIds)) : Promise.resolve([]),
    contactIds.length
      ? db.select({ id: schema.ghlContacts.id, name: schema.ghlContacts.name }).from(schema.ghlContacts).where(inArray(schema.ghlContacts.id, contactIds))
      : Promise.resolve([]),
    db.select().from(schema.ghlUsers),
    db.select().from(schema.jobs).where(eq(schema.jobs.status, "to_schedule")),
  ]);
  const jobByAppt = new Map(jobs.map((j) => [j.appointmentId, j]));
  const cname = new Map(contacts.map((c) => [c.id, c.name]));
  const uname = new Map(users.map((u) => [u.id, u.name]));
  const color = new Map(calendars.map((c, i) => [c.id, COLORS[i % COLORS.length]]));
  const toSchedule = unscheduled.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const inactive = calendars.filter((c) => !c.isActive);

  const range = `${fmtDate(`${monday}T12:00:00`)} – ${fmtDate(`${addDays(monday, 6)}T12:00:00`)}`;
  const navBtn = "flex size-9 items-center justify-center rounded-lg border border-line-field bg-surface hover:bg-hover";

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-6 pb-11 md:px-7">
      <PageHeader
        title="Calendar"
        subtitle={`Live from your GHL calendars · ${range}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/calendar?week=${addDays(monday, -7)}`} aria-label="Previous week" className={navBtn}>
              <ChevronLeft size={16} aria-hidden />
            </Link>
            <Link href="/calendar" className="rounded-lg border border-line-field bg-surface px-3 py-2 text-[12.5px] font-extrabold hover:bg-hover">
              This week
            </Link>
            <Link href={`/calendar?week=${addDays(monday, 7)}`} aria-label="Next week" className={navBtn}>
              <ChevronRight size={16} aria-hidden />
            </Link>
          </div>
        }
      />

      {error && <div role="alert" className="mb-3 rounded-xl bg-bad-tint px-4 py-3 text-[13px] font-bold text-bad">Couldn&apos;t load GHL calendars: {error}</div>}
      {inactive.length > 0 && (
        <div role="status" className="mb-3 rounded-xl bg-warn-tint px-4 py-3 text-[13px] font-bold text-warn">
          {inactive.map((c) => `“${calendarLabel(c.name)}”`).join(", ")} {inactive.length > 1 ? "are" : "is"} switched off in GHL and can&apos;t take bookings. Turn
          it on in GHL → Calendars.
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-3 text-[12px] font-bold text-ink-2">
        {calendars.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: color.get(c.id) }} aria-hidden />
            {calendarLabel(c.name)}
            {!c.isActive && <span className="text-faint">(off)</span>}
          </span>
        ))}
      </div>

      <div className="grid items-start gap-3.5 xl:grid-cols-[1fr_300px]">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((d) => {
            const dayEvents = events.filter((e) => easternParts(e.start).date === d);
            const isToday = d === today;
            return (
              <section key={d} aria-label={fmtDate(`${d}T12:00:00`)} className={`min-h-[140px] rounded-xl border bg-surface p-2 ${isToday ? "border-brand" : "border-line"}`}>
                <h2 className={`mb-1.5 px-1 text-[11.5px] font-extrabold tracking-[0.6px] uppercase ${isToday ? "text-brand" : "text-muted"}`}>
                  {new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))}
                </h2>
                <ul className="space-y-1.5">
                  {dayEvents.map((e) => {
                    const job = jobByAppt.get(e.id);
                    const href = job ? `/jobs/${job.id}` : e.contactId ? `/customers/${e.contactId}` : null;
                    const body = (
                      <div className={`rounded-lg border-l-4 bg-surface-soft px-2 py-1.5 ${e.status === "cancelled" ? "opacity-50 line-through" : ""}`} style={{ borderColor: color.get(e.calendarId) }}>
                        <div className="text-[11px] font-extrabold text-muted">
                          {fmtTime(e.start)} – {fmtTime(e.end)}
                          {e.status === "showed" && " · done"}
                        </div>
                        <div className="text-[12.5px] leading-tight font-extrabold text-ink">{e.contactId ? cname.get(e.contactId) ?? e.title : e.title}</div>
                        <div className="truncate text-[11px] font-semibold text-ink-2">{job ? job.title : e.title}</div>
                        {e.assignedUserId && <div className="text-[10.5px] font-bold text-faint">{uname.get(e.assignedUserId)}</div>}
                      </div>
                    );
                    return <li key={e.id}>{href ? <Link href={href} className="block hover:brightness-95">{body}</Link> : body}</li>;
                  })}
                  {dayEvents.length === 0 && <li className="px-1 text-[11.5px] font-semibold text-faint">—</li>}
                </ul>
              </section>
            );
          })}
        </div>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[15px] font-extrabold">To schedule</div>
            <Pill tone={toSchedule.length ? "warn" : "neutral"}>{toSchedule.length}</Pill>
          </div>
          {toSchedule.length === 0 ? (
            <p className="text-[12.5px] font-semibold text-faint">Every job is on the calendar.</p>
          ) : (
            <ul>
              {toSchedule.slice(0, 15).map((j) => (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="block border-b border-line-soft py-2 last:border-0 hover:bg-hover">
                    <div className="text-[13px] font-extrabold text-ink">
                      #{j.number} {j.kind === "plan_visit" ? "· plan visit" : ""}
                    </div>
                    <div className="truncate text-[12px] font-semibold text-muted">{j.title}</div>
                    {j.dueDate && <div className="text-[11px] font-bold text-warn">Due {fmtDate(`${j.dueDate}T12:00:00`)}</div>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
