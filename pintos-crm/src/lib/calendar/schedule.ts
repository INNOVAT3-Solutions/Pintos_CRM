import "server-only";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { calendarLabel, listCalendars, listEvents, type CalendarEvent } from "@/lib/ghl/calendars";
import { easternIso, easternParts, initials } from "@/lib/format";
import type { ScheduleData, ScheduleEvent, ScheduleQuery, ScheduleView } from "./types";

/** One colour per GHL calendar, in the calendars' sorted order (same as before). */
const COLORS = ["#1B6FAE", "#F26F1F", "#6D4BA6", "#1F8A5B", "#B7791F", "#C53030"];

const isDate = (s: string | undefined | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`;
function shiftMonth(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  return d.toISOString().slice(0, 10);
}
const lastOfMonth = (date: string) => addDays(shiftMonth(date, 1), -1);

const fmt = (opts: Intl.DateTimeFormatOptions) => {
  const f = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" });
  return (date: string) => f.format(new Date(`${date}T12:00:00Z`));
};
const fmtLong = fmt({ weekday: "long", month: "long", day: "numeric", year: "numeric" });
const fmtMonth = fmt({ month: "long", year: "numeric" });
const fmtMd = fmt({ month: "short", day: "numeric" });
const fmtMdy = fmt({ month: "short", day: "numeric", year: "numeric" });

/** Read view / date / person from URL search params, with safe defaults. */
export function parseScheduleQuery(p: { view?: string; date?: string; person?: string }, fallbackView: ScheduleView = "week"): ScheduleQuery {
  const view: ScheduleView = p.view === "day" || p.view === "week" || p.view === "month" ? p.view : fallbackView;
  const date = isDate(p.date) ? p.date : easternParts(new Date()).date;
  const person = p.person && /^[\w-]{1,64}$/.test(p.person) ? p.person : "all";
  return { view, date, person };
}

function rangeFor(view: ScheduleView, date: string) {
  if (view === "day") return { days: [date], prev: addDays(date, -1), next: addDays(date, 1), label: fmtLong(date) };
  if (view === "week") {
    const mon = mondayOf(date);
    const sun = addDays(mon, 6);
    const label = mon.slice(0, 4) === sun.slice(0, 4) ? `${fmtMd(mon)} – ${fmtMdy(sun)}` : `${fmtMdy(mon)} – ${fmtMdy(sun)}`;
    return { days: Array.from({ length: 7 }, (_, i) => addDays(mon, i)), prev: addDays(mon, -7), next: addDays(mon, 7), label };
  }
  const first = firstOfMonth(date);
  const start = mondayOf(first);
  const end = addDays(mondayOf(lastOfMonth(first)), 6);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return { days, prev: shiftMonth(first, -1), next: shiftMonth(first, 1), label: fmtMonth(first) };
}

const minutes = (iso: string) => {
  const [h, m] = easternParts(iso).time.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Everything a calendar view needs, already in Miami time and display-ready, so the
 * browser never does timezone math. Appointments are read live from every GHL calendar.
 */
export async function getSchedule(q: ScheduleQuery): Promise<ScheduleData> {
  const today = easternParts(new Date()).date;
  const r = rangeFor(q.view, q.date);
  const from = r.days[0];
  const to = addDays(r.days[r.days.length - 1], 1);

  let events: CalendarEvent[] = [];
  let calendars: Awaited<ReturnType<typeof listCalendars>> = [];
  let error: string | null = null;
  try {
    calendars = await listCalendars();
    events = await listEvents(new Date(easternIso(from, "00:00")), new Date(easternIso(to, "00:00")));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const db = await getDb();
  const apptIds = events.map((e) => e.id);
  const contactIds = [...new Set(events.map((e) => e.contactId).filter((x): x is string => !!x))];
  const [jobs, contacts, users] = await Promise.all([
    apptIds.length ? db.select().from(schema.jobs).where(inArray(schema.jobs.appointmentId, apptIds)) : Promise.resolve([]),
    contactIds.length
      ? db.select({ id: schema.ghlContacts.id, name: schema.ghlContacts.name }).from(schema.ghlContacts).where(inArray(schema.ghlContacts.id, contactIds))
      : Promise.resolve([]),
    db.select().from(schema.ghlUsers),
  ]);
  const jobByAppt = new Map(jobs.map((j) => [j.appointmentId, j]));
  const cname = new Map(contacts.map((c) => [c.id, c.name]));
  const color = new Map(calendars.map((c, i) => [c.id, COLORS[i % COLORS.length]]));

  const all: ScheduleEvent[] = events.map((e) => {
    const job = jobByAppt.get(e.id);
    const startDate = easternParts(e.start).date;
    const endDate = easternParts(e.end).date;
    const startMin = minutes(e.start);
    // An appointment running past midnight is drawn to the end of its first day.
    const endMin = endDate > startDate ? 24 * 60 : Math.max(minutes(e.end), startMin + 15);
    return {
      id: e.id,
      calendarId: e.calendarId,
      color: color.get(e.calendarId) ?? COLORS[0],
      date: startDate,
      startMin,
      endMin,
      start: e.start,
      end: e.end,
      title: (e.contactId && cname.get(e.contactId)) || e.title,
      detail: job ? `#${job.number} · ${job.title}` : e.title,
      personId: e.assignedUserId,
      status: e.status,
      address: e.address,
      href: job ? `/jobs/${job.id}` : e.contactId ? `/customers/${e.contactId}` : null,
    };
  });

  // People: every GHL user, plus anyone assigned in this range we don't know yet.
  const known = new Map(users.map((u) => [u.id, u.name]));
  for (const e of all) if (e.personId && !known.has(e.personId)) known.set(e.personId, "Unknown user");
  const counts = new Map<string, number>();
  for (const e of all) if (e.status !== "cancelled") counts.set(e.personId ?? "unassigned", (counts.get(e.personId ?? "unassigned") ?? 0) + 1);
  const people = [...known.entries()]
    .map(([id, name]) => ({ id, name, initials: initials(name), count: counts.get(id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const unassignedCount = counts.get("unassigned") ?? 0;

  const person = q.person === "all" || q.person === "unassigned" || known.has(q.person) ? q.person : "all";
  const shown = all
    .filter((e) => (person === "all" ? true : person === "unassigned" ? !e.personId : e.personId === person))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin || a.endMin - b.endMin);

  return {
    view: q.view,
    date: q.date,
    today,
    person,
    label: r.label,
    days: r.days,
    month: q.view === "month" ? firstOfMonth(q.date).slice(0, 7) : null,
    prev: r.prev,
    next: r.next,
    people,
    unassignedCount,
    totalCount: all.filter((e) => e.status !== "cancelled").length,
    calendars: calendars.map((c) => ({ id: c.id, label: calendarLabel(c.name), color: color.get(c.id)!, isActive: c.isActive })),
    events: shown,
    error,
  };
}
