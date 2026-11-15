/** Shared by the server (schedule.ts) and the browser calendar component. */

export type ScheduleView = "day" | "week" | "month";

export interface ScheduleQuery {
  view: ScheduleView;
  /** Anchor date, YYYY-MM-DD on the Miami calendar. */
  date: string;
  /** "all", "unassigned", or a GHL user id. */
  person: string;
}

export interface ScheduleEvent {
  id: string;
  calendarId: string;
  color: string;
  /** Miami date the appointment starts on. */
  date: string;
  /** Minutes after Miami midnight. */
  startMin: number;
  endMin: number;
  start: string;
  end: string;
  /** Customer name (or the appointment title when there's no contact). */
  title: string;
  /** Job number and title, or the appointment title. */
  detail: string;
  personId: string | null;
  status: string;
  address: string | null;
  href: string | null;
}

export interface SchedulePerson {
  id: string;
  name: string;
  initials: string;
  /** Appointments in the visible range (cancelled ones excluded). */
  count: number;
}

export interface ScheduleData {
  view: ScheduleView;
  date: string;
  today: string;
  person: string;
  /** "November 2026", "Nov 9 – Nov 15, 2026", "Monday, November 16, 2026". */
  label: string;
  /** Every date drawn in the grid (month view includes the edge weeks). */
  days: string[];
  /** "2026-11" in month view, so days outside the month can be dimmed. */
  month: string | null;
  prev: string;
  next: string;
  people: SchedulePerson[];
  unassignedCount: number;
  totalCount: number;
  calendars: { id: string; label: string; color: string; isActive: boolean }[];
  /** Already filtered to the chosen person. */
  events: ScheduleEvent[];
  error: string | null;
}
