"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ChecklistItem, JobStatus } from "@/lib/db/schema";
import { saveChecklist, saveJobNotes, scheduleJob, setJobStatus, unscheduleJob, type JobResult } from "@/lib/jobs/actions";
import { Button, Card, Notice } from "@/components/ui";

interface JobView {
  id: string;
  status: JobStatus;
  checklist: ChecklistItem[];
  notes: string;
  calendarId: string | null;
  assignedUserId: string | null;
  date: string;
  time: string;
  hours: number;
}

const input =
  "w-full rounded-lg border border-line-field bg-surface px-2.5 py-2 text-[13px] font-semibold text-ink focus:border-sky focus:outline-none disabled:bg-field";

/**
 * Interactive parts of a job. Rendered twice by the page: `part="schedule"` for
 * the scheduling card, `part="work"` for checklist / notes / status buttons.
 */
export function JobControls({
  job,
  calendars,
  users,
  part,
}: {
  job: JobView;
  calendars: { id: string; name: string; isActive: boolean; team: string[] }[];
  users: { id: string; name: string }[];
  part: "schedule" | "work";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<JobResult | null>(null);
  const done = job.status === "completed" || job.status === "cancelled";

  const run = (fn: () => Promise<JobResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      router.refresh();
    });

  const messages = (
    <>
      {result?.error && <Notice tone="error">{result.error}</Notice>}
      {result?.ok && <Notice tone="ok">{result.ok}</Notice>}
      {result?.warning && <div role="status" className="rounded-[10px] bg-warn-tint px-3 py-2.5 text-[12.5px] font-bold text-warn">{result.warning}</div>}
    </>
  );

  /* ---------------- schedule card ---------------- */
  const firstActive = calendars.find((c) => c.isActive)?.id ?? "";
  const [date, setDate] = useState(job.date);
  const [time, setTime] = useState(job.time);
  const [hours, setHours] = useState(String(job.hours));
  const [calendarId, setCalendarId] = useState(job.calendarId ?? firstActive);
  // GHL only accepts assignees who are on the calendar's team.
  const teamOf = (calId: string) => {
    const team = calendars.find((c) => c.id === calId)?.team ?? [];
    return users.filter((u) => team.includes(u.id));
  };
  const [assigned, setAssigned] = useState(job.assignedUserId ?? teamOf(job.calendarId ?? firstActive)[0]?.id ?? "");
  const eligible = teamOf(calendarId);
  const notOnTeam = users.filter((u) => !eligible.some((e) => e.id === u.id));

  if (part === "schedule") {
    if (done) return <p className="mt-1 text-[12.5px] font-semibold text-muted">This job is {job.status}.</p>;
    const inactive = calendars.filter((c) => !c.isActive);
    return (
      <div className="mt-2 space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Start</span>
            <input type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} className={input} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Length</span>
          <select value={hours} onChange={(e) => setHours(e.target.value)} className={input}>
            {["1", "1.5", "2", "3", "4", "5", "6", "8"].map((h) => (
              <option key={h} value={h}>
                {h} hour{h === "1" ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">GHL calendar</span>
          <select
            value={calendarId}
            onChange={(e) => {
              setCalendarId(e.target.value);
              const team = teamOf(e.target.value);
              if (!team.some((u) => u.id === assigned)) setAssigned(team[0]?.id ?? "");
            }}
            className={input}
          >
            {calendars.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.isActive}>
                {c.name}
                {c.isActive ? "" : " (switched off in GHL)"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-extrabold text-ink-2">Assigned to</span>
          <select value={assigned} onChange={(e) => setAssigned(e.target.value)} className={input}>
            <option value="">Unassigned</option>
            {eligible.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] font-semibold text-faint">
            {notOnTeam.length
              ? `${notOnTeam.map((u) => u.name).join(", ")} ${notOnTeam.length > 1 ? "aren't" : "isn't"} on this calendar's team in GHL (GHL → Calendars → Team members).`
              : "Everyone on this calendar's GHL team."}
          </span>
        </label>
        {inactive.length > 0 && (
          <p className="text-[11.5px] font-bold text-warn">
            {inactive.map((c) => `“${c.name}”`).join(", ")} {inactive.length > 1 ? "are" : "is"} switched off in GHL, so it can&apos;t take bookings.
          </p>
        )}
        <Button
          className="w-full"
          disabled={pending || !date || !calendarId}
          onClick={() =>
            run(() => scheduleJob(job.id, { date, time, hours: Number(hours), calendarId, assignedUserId: assigned || null }))
          }
        >
          {pending ? "Booking in GHL…" : job.status === "to_schedule" ? "Schedule on GHL calendar" : "Reschedule"}
        </Button>
        {job.status === "scheduled" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => unscheduleJob(job.id))}
            className="w-full cursor-pointer text-[12.5px] font-bold text-muted underline hover:text-ink"
          >
            Unschedule (cancels the GHL appointment)
          </button>
        )}
        {messages}
      </div>
    );
  }

  /* ---------------- work card ---------------- */
  return (
    <WorkCard job={job} done={done} pending={pending} run={run} messages={messages} />
  );
}

function WorkCard({
  job,
  done,
  pending,
  run,
  messages,
}: {
  job: JobView;
  done: boolean;
  pending: boolean;
  run: (fn: () => Promise<JobResult>) => void;
  messages: React.ReactNode;
}) {
  const [list, setList] = useState(job.checklist);
  const [newItem, setNewItem] = useState("");
  const [notes, setNotes] = useState(job.notes);
  const save = (next: ChecklistItem[]) => {
    setList(next);
    run(() => saveChecklist(job.id, next));
  };
  const doneCount = list.filter((i) => i.done).length;

  return (
    <>
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[15px] font-extrabold">Checklist</div>
          <span className="text-[12px] font-extrabold text-muted">
            {doneCount}/{list.length}
          </span>
        </div>
        <ul className="space-y-1">
          {list.map((it, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-hover">
              <input
                type="checkbox"
                aria-label={it.text}
                className="size-[18px] accent-brand"
                checked={it.done}
                disabled={done || pending}
                onChange={(e) => save(list.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
              />
              <span className={`flex-1 text-[13.5px] font-bold ${it.done ? "text-muted line-through" : "text-ink"}`}>{it.text}</span>
              {!done && (
                <button
                  type="button"
                  aria-label={`Remove ${it.text}`}
                  onClick={() => save(list.filter((_, j) => j !== i))}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-subtle hover:text-bad"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!done && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newItem.trim()) return;
              save([...list, { text: newItem.trim(), done: false }]);
              setNewItem("");
            }}
          >
            <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a step — e.g. pre-wet plants" aria-label="New checklist item" className={input} />
            <button type="submit" aria-label="Add step" className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line-field hover:bg-hover">
              <Plus size={15} aria-hidden />
            </button>
          </form>
        )}
      </Card>

      <Card>
        <label className="block">
          <span className="mb-1.5 block text-[15px] font-extrabold">Crew notes</span>
          <textarea rows={3} value={notes} disabled={done} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, chemicals used, issues found…" className={input} />
        </label>
        {!done && notes !== job.notes && (
          <div className="mt-2">
            <Button variant="secondary" disabled={pending} onClick={() => run(() => saveJobNotes(job.id, notes))}>
              Save notes
            </Button>
          </div>
        )}
      </Card>

      {!done && (
        <div className="flex flex-wrap gap-2">
          {job.status === "scheduled" && (
            <Button variant="secondary" disabled={pending} onClick={() => run(() => setJobStatus(job.id, "in_progress"))}>
              Start job
            </Button>
          )}
          {(job.status === "scheduled" || job.status === "in_progress") && (
            <Button disabled={pending} onClick={() => run(() => setJobStatus(job.id, "completed"))}>
              {pending ? "Saving…" : "Mark completed"}
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-bad"
            disabled={pending}
            onClick={() => {
              if (confirm("Cancel this job? A booked GHL appointment will be cancelled too.")) run(() => setJobStatus(job.id, "cancelled"));
            }}
          >
            Cancel job
          </Button>
        </div>
      )}
      {messages}
    </>
  );
}
