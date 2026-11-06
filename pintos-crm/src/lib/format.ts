/** Formatting shared by server and client. The business runs on Miami (Eastern) time. */
export const TZ = "America/New_York";

const money0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const money = (n: number) => (Number.isInteger(n) ? money0 : money2).format(n);

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ });
const shortDateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TZ,
});

const timeOnly = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
/** "11:00 AM" on the Miami clock. */
export const fmtTime = (d: Date | string) => timeOnly.format(new Date(d));

export const fmtDate = (d: Date | string | null | undefined) => (d ? shortDate.format(new Date(d)) : "—");
export const fmtDateTime = (d: Date | string | null | undefined) => (d ? shortDateTime.format(new Date(d)) : "—");

/** "just now", "5m", "3h", "4d", "6w", then the date. */
export function ago(d: Date | string | null | undefined, now = Date.now()): string {
  if (!d) return "—";
  const s = Math.max(0, (now - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86_400 * 14) return `${Math.floor(s / 86_400)}d ago`;
  if (s < 86_400 * 60) return `${Math.floor(s / 604_800)}w ago`;
  return fmtDate(d);
}

/** UTC offset of Eastern time at a given instant, in minutes (e.g. -240 in summer). */
function easternOffsetMinutes(at: Date): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-4"
  const m = part?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return -300;
  const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -mins : mins;
}

/**
 * "2027-01-12" + "09:30" on the Miami clock → an ISO string with the correct
 * offset for that day (handles daylight saving), e.g. "2027-01-12T09:30:00-05:00".
 */
export function easternIso(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  // Read the wall-clock time as if it were standard time (UTC−5) to get an instant on that day,
  // then use the real offset in force at that instant. Exact except inside DST's skipped hour.
  const asStandardTime = Date.UTC(y, mo - 1, d, h, mi) + 5 * 3600_000;
  const offset = easternOffsetMinutes(new Date(asStandardTime));
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date}T${pad(h)}:${pad(mi)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Date and time parts on the Miami clock for an instant: { date: "2027-01-12", time: "09:30" }. */
export function easternParts(at: Date | string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Midnight on the 1st of the current month, Eastern time. */
export function startOfMonthEastern(now = new Date()): Date {
  const [y, mo] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, 1));
  return new Date(guess.getTime() - easternOffsetMinutes(guess) * 60_000);
}

/** GHL notes may be HTML from its rich-text editor; show them as plain text (never render their HTML). */
export function htmlToText(s: string): string {
  if (!/<[a-z!/]/i.test(s)) return s;
  return s
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
