import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getSchedule, parseScheduleQuery } from "@/lib/calendar/schedule";
import { fmtDate } from "@/lib/format";
import { Card, PageHeader, Pill } from "@/components/ui";
import { ScheduleCalendar } from "@/components/schedule/schedule-calendar";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; person?: string; week?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  // Old links used ?week=YYYY-MM-DD; they still open that week.
  const q = parseScheduleQuery(sp.week && !sp.date ? { view: "week", date: sp.week, person: sp.person } : sp, "week");

  const db = await getDb();
  const [schedule, unscheduled] = await Promise.all([getSchedule(q), db.select().from(schema.jobs).where(eq(schema.jobs.status, "to_schedule"))]);
  const toSchedule = unscheduled.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const inactive = schedule.calendars.filter((c) => !c.isActive);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-6 pb-11 md:px-7">
      <PageHeader title="Calendar" subtitle="Live from your GHL calendars. Pick a day, week or month, for everyone or one person." />

      {inactive.length > 0 && (
        <div role="status" className="mb-3 rounded-xl bg-warn-tint px-4 py-3 text-[13px] font-bold text-warn">
          {inactive.map((c) => `“${c.label}”`).join(", ")} {inactive.length > 1 ? "are" : "is"} switched off in GHL and can&apos;t take bookings. Turn it on
          in GHL → Calendars.
        </div>
      )}

      <div className="grid items-start gap-3.5 xl:grid-cols-[1fr_290px]">
        <Card className="min-w-0">
          <ScheduleCalendar initial={schedule} syncUrl />
        </Card>

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
