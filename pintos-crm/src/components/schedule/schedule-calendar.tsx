"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ScheduleData, ScheduleEvent, ScheduleQuery, ScheduleView } from "@/lib/calendar/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** "9:30 AM" from minutes after midnight (times arrive already on the Miami clock). */
function fmtMin(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}
const dayFmt = (opts: Intl.DateTimeFormatOptions) => {
  const f = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" });
  return (d: string) => f.format(new Date(`${d}T12:00:00Z`));
};
const fmtWeekday = dayFmt({ weekday: "short" });
const fmtWeekdayDay = dayFmt({ weekday: "short", month: "short", day: "numeric" });
const fmtLong = dayFmt({ weekday: "long", month: "long", day: "numeric" });

/** Minutes after midnight right now on the Miami clock. */
function miamiNowMin(): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
}

const VIEWS: { id: ScheduleView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export function ScheduleCalendar({
  initial,
  variant = "full",
  syncUrl = false,
}: {
  initial: ScheduleData;
  /** "compact" is the dashboard panel: shorter grids, a link to the full Calendar. */
  variant?: "full" | "compact";
  /** Keep the address bar in step (Calendar screen) so a view can be bookmarked or shared. */
  syncUrl?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const req = useRef<AbortController | null>(null);
  const compact = variant === "compact";

  useEffect(() => () => req.current?.abort(), []);

  const qs = (q: ScheduleQuery) => new URLSearchParams({ view: q.view, date: q.date, person: q.person }).toString();

  async function go(patch: Partial<ScheduleQuery>) {
    const q: ScheduleQuery = { view: data.view, date: data.date, person: data.person, ...patch };
    req.current?.abort();
    const ctrl = new AbortController();
    req.current = ctrl;
    setLoading(true);
    setFailed(false);
    if (syncUrl) window.history.replaceState(null, "", `?${qs(q)}`);
    try {
      const res = await fetch(`/api/calendar/schedule?${qs(q)}`, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFailed(true);
    } finally {
      if (req.current === ctrl) setLoading(false);
    }
  }

  const openDay = (date: string) => go({ view: "day", date });
  const navBtn = "flex size-9 items-center justify-center rounded-lg border border-line-field bg-surface text-ink hover:bg-hover disabled:opacity-50";

  const chips = [
    { id: "all", label: "Everyone", count: data.totalCount },
    ...data.people.map((p) => ({ id: p.id, label: p.name, count: p.count })),
    ...(data.unassignedCount > 0 || data.person === "unassigned" ? [{ id: "unassigned", label: "Unassigned", count: data.unassignedCount }] : []),
  ];

  return (
    <div>
      {/* Toolbar: where you are, how you're looking, whose schedule. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => go({ date: data.prev })} aria-label={`Previous ${data.view}`} className={navBtn}>
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go({ date: data.today })}
            className="h-9 rounded-lg border border-line-field bg-surface px-3 text-[12.5px] font-extrabold text-ink hover:bg-hover"
          >
            Today
          </button>
          <button type="button" onClick={() => go({ date: data.next })} aria-label={`Next ${data.view}`} className={navBtn}>
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        <h2 aria-live="polite" className={cx("min-w-0 flex-1 font-display font-extrabold text-ink", compact ? "text-[17px]" : "text-[19px]")}>
          {data.label}
        </h2>
        <div role="group" aria-label="Calendar view" className="flex rounded-lg border border-line-field bg-surface p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={data.view === v.id}
              onClick={() => go({ view: v.id })}
              className={cx(
                "h-8 rounded-md px-3 text-[12.5px] font-extrabold transition-colors",
                data.view === v.id ? "bg-navy text-white" : "text-ink-2 hover:bg-hover",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-label="Whose schedule" className="mb-3 flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const on = data.person === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => go({ person: c.id })}
              className={cx(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-extrabold transition-colors",
                on ? "border-navy bg-navy text-white" : "border-line-field bg-surface text-ink-2 hover:bg-hover",
              )}
            >
              {c.label}
              <span className={cx("tabular-nums", on ? "text-white/70" : "text-faint")}>{c.count}</span>
            </button>
          );
        })}
      </div>

      {data.error && (
        <div role="alert" className="mb-3 rounded-xl bg-bad-tint px-4 py-3 text-[13px] font-bold text-bad">
          Couldn&apos;t load GHL calendars: {data.error}
        </div>
      )}
      {failed && (
        <div role="alert" className="mb-3 rounded-xl bg-bad-tint px-4 py-3 text-[13px] font-bold text-bad">
          Couldn&apos;t load that view. Check your connection and try again.
        </div>
      )}

      <div aria-busy={loading} className={cx("transition-opacity duration-150", loading && "opacity-55")}>
        {data.view === "day" && <DayView data={data} compact={compact} />}
        {data.view === "week" && <WeekView data={data} compact={compact} onOpenDay={openDay} />}
        {data.view === "month" && <MonthView data={data} compact={compact} onOpenDay={openDay} />}
      </div>

      {!compact && data.calendars.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 text-[12px] font-bold text-ink-2">
          {data.calendars.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
              {c.label}
              {!c.isActive && <span className="text-faint">(off)</span>}
            </span>
          ))}
        </div>
      )}
      {compact && (
        <div className="mt-3 text-right">
          <Link href={`/calendar?${qs(data)}`} className="text-[12px] font-extrabold text-blue hover:text-brand">
            Open full calendar →
          </Link>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Day: a timeline, one column per person ───────────────────────── */

/** Side-by-side columns for overlapping appointments within one lane. */
function layoutLane(evts: ScheduleEvent[]) {
  const sorted = [...evts].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: { e: ScheduleEvent; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = colEnds.length;
    for (const c of cluster) out.set(c.e.id, { col: c.col, cols });
    cluster = [];
    colEnds = [];
  };
  for (const e of sorted) {
    if (e.startMin >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= e.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(e.endMin);
    } else colEnds[col] = e.endMin;
    cluster.push({ e, col });
    clusterEnd = Math.max(clusterEnd, e.endMin);
  }
  flush();
  return out;
}

function DayView({ data, compact }: { data: ScheduleData; compact: boolean }) {
  const date = data.days[0];
  const events = data.events.filter((e) => e.date === date);
  const live = events.filter((e) => e.status !== "cancelled");

  const lanes = useMemo(() => {
    if (data.person !== "all") {
      const p = data.people.find((x) => x.id === data.person);
      return [{ id: data.person, name: p?.name ?? "Unassigned", initials: p?.initials ?? "—" }];
    }
    const ids = new Set(events.map((e) => e.personId ?? "unassigned"));
    const list = data.people.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name, initials: p.initials }));
    if (ids.has("unassigned")) list.push({ id: "unassigned", name: "Unassigned", initials: "—" });
    return list;
  }, [data.person, data.people, events]);

  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    if (date !== data.today) return setNowMin(null);
    setNowMin(miamiNowMin());
    const t = setInterval(() => setNowMin(miamiNowMin()), 60_000);
    return () => clearInterval(t);
  }, [date, data.today]);

  if (live.length === 0 && events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-field bg-surface-soft px-4 py-10 text-center">
        <div className="text-[14px] font-extrabold text-ink">Nothing scheduled {date === data.today ? "today" : `on ${fmtLong(date)}`}.</div>
        <div className="mt-1 text-[12.5px] font-semibold text-muted">Schedule a job from the Jobs screen and it appears here.</div>
      </div>
    );
  }

  const PX = compact ? 44 : 56; // pixels per hour
  const h0 = Math.min(7, Math.floor(Math.min(...events.map((e) => e.startMin)) / 60));
  const h1 = Math.max(19, Math.ceil(Math.max(...events.map((e) => e.endMin)) / 60));
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const height = (h1 - h0) * PX;
  const y = (min: number) => ((min - h0 * 60) / 60) * PX;

  return (
    <div className={cx("overflow-auto rounded-xl border border-line bg-surface", compact && "max-h-[460px]")}>
      <div className="grid min-w-max" style={{ gridTemplateColumns: `56px repeat(${lanes.length}, minmax(180px, 1fr))` }}>
        {/* Lane headers */}
        <div className="sticky top-0 z-20 border-b border-line bg-surface" />
        {lanes.map((l) => {
          const n = live.filter((e) => (e.personId ?? "unassigned") === l.id).length;
          return (
            <div key={l.id} className="sticky top-0 z-20 flex items-center gap-2 border-b border-l border-line bg-surface px-3 py-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#EAF4FB] text-[11px] font-extrabold text-blue">{l.initials}</span>
              <span className="min-w-0 truncate text-[13px] font-extrabold text-ink">{l.name}</span>
              <span className="ml-auto text-[11.5px] font-bold text-faint tabular-nums">{n}</span>
            </div>
          );
        })}

        {/* Hour gutter */}
        <div className="relative" style={{ height }}>
          {hours.map((h) => (
            <div key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] font-bold text-faint" style={{ top: y(h * 60) }}>
              {h === h0 ? "" : fmtMin(h * 60)}
            </div>
          ))}
        </div>

        {lanes.map((l) => {
          const laneEvents = events.filter((e) => (e.personId ?? "unassigned") === l.id);
          const pos = layoutLane(laneEvents);
          return (
            <div key={l.id} className="relative border-l border-line" style={{ height }}>
              {hours.map((h) => (
                <div key={h} aria-hidden className="absolute inset-x-0 border-t border-line-soft" style={{ top: y(h * 60) }} />
              ))}
              {nowMin !== null && nowMin >= h0 * 60 && nowMin <= h1 * 60 && (
                <div aria-hidden className="absolute inset-x-0 z-10 border-t-2 border-brand" style={{ top: y(nowMin) }} />
              )}
              {laneEvents.map((e) => {
                const p = pos.get(e.id) ?? { col: 0, cols: 1 };
                const top = y(e.startMin);
                const h = Math.max(y(e.endMin) - top, 26);
                const short = h < 48;
                const body = (
                  <div
                    className={cx("h-full overflow-hidden rounded-md border-l-4 px-2 py-1", e.status === "cancelled" && "line-through opacity-50")}
                    style={{ borderColor: e.color, background: `${e.color}17` }}
                  >
                    <div className="truncate text-[10.5px] font-extrabold text-muted">
                      {fmtMin(e.startMin)} – {fmtMin(e.endMin)}
                      {e.status === "showed" && " · done"}
                      {short && <span className="text-ink"> · {e.title}</span>}
                    </div>
                    {!short && <div className="truncate text-[12.5px] leading-tight font-extrabold text-ink">{e.title}</div>}
                    {!short && <div className="truncate text-[11px] font-semibold text-ink-2">{e.detail}</div>}
                    {!short && e.address && h >= 70 && <div className="truncate text-[10.5px] font-semibold text-muted">{e.address}</div>}
                  </div>
                );
                return (
                  <div
                    key={e.id}
                    className="absolute px-0.5"
                    style={{ top, height: h, left: `${(p.col / p.cols) * 100}%`, width: `${100 / p.cols}%` }}
                  >
                    {e.href ? (
                      <Link href={e.href} className="block h-full rounded-md hover:brightness-95 focus-visible:outline-2 focus-visible:outline-sky">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Week: seven days, each a list ───────────────────────── */

function EventRow({ e, showPerson, people }: { e: ScheduleEvent; showPerson: boolean; people: ScheduleData["people"] }) {
  const who = e.personId ? people.find((p) => p.id === e.personId) : null;
  const body = (
    <div className={cx("rounded-lg border-l-4 bg-surface-soft px-2 py-1.5", e.status === "cancelled" && "line-through opacity-50")} style={{ borderColor: e.color }}>
      <div className="flex items-center justify-between gap-1 text-[11px] font-extrabold text-muted">
        <span>
          {fmtMin(e.startMin)}
          {e.status === "showed" && " · done"}
        </span>
        {showPerson && (
          <span title={who?.name ?? "Unassigned"} className="rounded-full bg-[#EAF4FB] px-1.5 text-[10px] font-extrabold text-blue">
            {who?.initials ?? "—"}
          </span>
        )}
      </div>
      <div className="text-[12.5px] leading-tight font-extrabold text-ink">{e.title}</div>
      <div className="truncate text-[11px] font-semibold text-ink-2">{e.detail}</div>
    </div>
  );
  return e.href ? (
    <Link href={e.href} className="block rounded-lg hover:brightness-95 focus-visible:outline-2 focus-visible:outline-sky">
      {body}
    </Link>
  ) : (
    body
  );
}

function WeekView({ data, compact, onOpenDay }: { data: ScheduleData; compact: boolean; onOpenDay: (d: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {data.days.map((d) => {
        const evts = data.events.filter((e) => e.date === d).sort((a, b) => a.startMin - b.startMin);
        const isToday = d === data.today;
        return (
          <section
            key={d}
            aria-label={fmtLong(d)}
            className={cx("rounded-xl border bg-surface p-2", compact ? "lg:min-h-[120px]" : "lg:min-h-[180px]", isToday ? "border-brand" : "border-line")}
          >
            <button
              type="button"
              onClick={() => onOpenDay(d)}
              className={cx(
                "mb-1.5 w-full rounded-md px-1 py-0.5 text-left text-[11.5px] font-extrabold tracking-[0.6px] uppercase hover:bg-hover",
                isToday ? "text-brand" : "text-muted",
              )}
            >
              {fmtWeekdayDay(d)}
            </button>
            <ul className="space-y-1.5">
              {evts.map((e) => (
                <li key={e.id}>
                  <EventRow e={e} showPerson={data.person === "all"} people={data.people} />
                </li>
              ))}
              {evts.length === 0 && <li className="px-1 text-[11.5px] font-semibold text-faint">—</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Month: the whole month at a glance ───────────────────────── */

function MonthView({ data, compact, onOpenDay }: { data: ScheduleData; compact: boolean; onOpenDay: (d: string) => void }) {
  const max = compact ? 2 : 3;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line bg-surface-soft">
        {data.days.slice(0, 7).map((d) => (
          <div key={d} className="px-2 py-1.5 text-[11px] font-extrabold tracking-[0.6px] text-muted uppercase">
            {fmtWeekday(d)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {data.days.map((d, i) => {
          const evts = data.events.filter((e) => e.date === d && e.status !== "cancelled").sort((a, b) => a.startMin - b.startMin);
          const inMonth = data.month ? d.startsWith(data.month) : true;
          const isToday = d === data.today;
          const extra = evts.length - max;
          return (
            <div
              key={d}
              className={cx(
                "flex flex-col gap-0.5 border-line p-1 sm:p-1.5",
                compact ? "min-h-[64px] sm:min-h-[96px]" : "min-h-[72px] sm:min-h-[116px]",
                i % 7 !== 0 && "border-l",
                i >= 7 && "border-t",
                !inMonth && "bg-surface-soft",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenDay(d)}
                aria-label={`${fmtLong(d)}: ${evts.length} appointment${evts.length === 1 ? "" : "s"}`}
                className={cx(
                  "flex size-7 items-center justify-center rounded-full text-[12.5px] font-extrabold hover:bg-hover",
                  isToday ? "bg-brand text-white hover:bg-brand-deep" : inMonth ? "text-ink" : "text-subtle",
                )}
              >
                {Number(d.slice(8))}
              </button>
              {/* Phones: a dot per appointment; wider screens: the first few by name. */}
              {evts.length > 0 && (
                <button type="button" onClick={() => onOpenDay(d)} aria-hidden tabIndex={-1} className="flex flex-wrap gap-0.5 px-1 sm:hidden">
                  {evts.slice(0, 4).map((e) => (
                    <span key={e.id} className="size-1.5 rounded-full" style={{ background: e.color }} />
                  ))}
                </button>
              )}
              <ul className="hidden space-y-0.5 sm:block">
                {evts.slice(0, max).map((e) => (
                  <li key={e.id}>
                    {e.href ? (
                      <Link
                        href={e.href}
                        className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] font-bold text-ink hover:bg-hover"
                        title={`${fmtMin(e.startMin)} ${e.title} — ${e.detail}`}
                      >
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden />
                        <span className="text-muted">{fmtMin(e.startMin)}</span>
                        <span className="truncate">{e.title}</span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-1 truncate px-1 py-0.5 text-[11px] font-bold text-ink">
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden />
                        <span className="text-muted">{fmtMin(e.startMin)}</span>
                        <span className="truncate">{e.title}</span>
                      </div>
                    )}
                  </li>
                ))}
                {extra > 0 && (
                  <li>
                    <button type="button" onClick={() => onOpenDay(d)} className="px-1 text-[11px] font-extrabold text-blue hover:text-brand">
                      +{extra} more
                    </button>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
