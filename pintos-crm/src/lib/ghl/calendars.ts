import "server-only";
import { ghl, locationId } from "./client";

/**
 * GHL calendars & appointments (API version 2021-04-15). Verified live on
 * 2026-11-05: booking works on active calendars (inactive ones reject it),
 * PUT reschedules / changes status, and GET returns the stored times.
 */
const V = "2021-04-15";

export interface Calendar {
  id: string;
  name: string;
  isActive: boolean;
  /** GHL user ids on the calendar's team. */
  team: string[];
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: string; // ISO with offset
  end: string;
  status: string; // confirmed | showed | noshow | cancelled | new | invalid
  contactId: string | null;
  assignedUserId: string | null;
  address: string | null;
}

let calCache: { at: number; list: Calendar[] } | null = null;

export async function listCalendars(fresh = false): Promise<Calendar[]> {
  if (!fresh && calCache && Date.now() - calCache.at < 5 * 60_000) return calCache.list;
  const d = await ghl<{ calendars?: { id: string; name: string; isActive?: boolean; teamMembers?: { userId: string }[] }[] }>(
    "/calendars/",
    { query: { locationId: locationId() }, version: V },
  );
  const list = (d.calendars ?? [])
    .map((c) => ({ id: c.id, name: c.name, isActive: c.isActive !== false, team: (c.teamMembers ?? []).map((m) => m.userId) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  calCache = { at: Date.now(), list };
  return list;
}

/** Display name without GHL's "CAL | " prefix. */
export const calendarLabel = (name: string) => name.replace(/^CAL\s*\|\s*/i, "");

interface RawEvent {
  id: string;
  calendarId: string;
  title?: string;
  startTime: string;
  endTime: string;
  appointmentStatus?: string;
  contactId?: string;
  assignedUserId?: string;
  address?: string;
  deleted?: boolean;
}

/** All appointments between two instants, across every calendar. */
export async function listEvents(from: Date, to: Date): Promise<CalendarEvent[]> {
  const cals = await listCalendars();
  const lists = await Promise.all(
    cals.map((c) =>
      ghl<{ events?: RawEvent[] }>("/calendars/events", {
        query: { locationId: locationId(), calendarId: c.id, startTime: from.getTime(), endTime: to.getTime() },
        version: V,
      }).then((d) => d.events ?? []),
    ),
  );
  return lists
    .flat()
    .filter((e) => !e.deleted)
    .map((e) => ({
      id: e.id,
      calendarId: e.calendarId,
      title: e.title || "Appointment",
      start: e.startTime,
      end: e.endTime,
      status: e.appointmentStatus ?? "confirmed",
      contactId: e.contactId ?? null,
      assignedUserId: e.assignedUserId ?? null,
      address: e.address ?? null,
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export interface AppointmentInput {
  calendarId: string;
  contactId: string;
  title: string;
  start: string; // ISO with offset
  end: string;
  assignedUserId?: string | null;
  address?: string | null;
}

/**
 * Book an appointment. Free-slot checks are skipped on purpose: the office
 * schedules jobs by hand and may double-book crews deliberately. GHL's own
 * notifications aren't triggered from here (toNotify: false); GHL workflows
 * can still react to the new appointment.
 */
export async function createAppointment(a: AppointmentInput): Promise<{ id: string }> {
  const d = await ghl<{ id: string }>("/calendars/events/appointments", {
    method: "POST",
    version: V,
    body: {
      calendarId: a.calendarId,
      locationId: locationId(),
      contactId: a.contactId,
      title: a.title.slice(0, 200),
      startTime: a.start,
      endTime: a.end,
      appointmentStatus: "confirmed",
      ...(a.assignedUserId ? { assignedUserId: a.assignedUserId } : {}),
      ...(a.address ? { address: a.address } : {}),
      ignoreFreeSlotValidation: true,
      toNotify: false,
    },
  });
  return { id: d.id };
}

export async function updateAppointment(
  id: string,
  patch: Partial<Pick<AppointmentInput, "start" | "end" | "title" | "assignedUserId" | "address" | "calendarId">> & {
    status?: "confirmed" | "showed" | "noshow" | "cancelled";
  },
): Promise<void> {
  await ghl(`/calendars/events/appointments/${id}`, {
    method: "PUT",
    version: V,
    body: {
      ...(patch.calendarId ? { calendarId: patch.calendarId } : {}),
      ...(patch.start ? { startTime: patch.start } : {}),
      ...(patch.end ? { endTime: patch.end } : {}),
      ...(patch.title ? { title: patch.title.slice(0, 200) } : {}),
      ...(patch.assignedUserId !== undefined && patch.assignedUserId ? { assignedUserId: patch.assignedUserId } : {}),
      ...(patch.address ? { address: patch.address } : {}),
      ...(patch.status ? { appointmentStatus: patch.status } : {}),
      ignoreFreeSlotValidation: true,
      toNotify: false,
    },
  });
}
