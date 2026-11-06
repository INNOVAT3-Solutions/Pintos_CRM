"use server";

import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import type { ChecklistItem, Job } from "@/lib/db/schema";
import { GhlError } from "@/lib/ghl/client";
import { createAppointment, listCalendars, updateAppointment } from "@/lib/ghl/calendars";
import { updateContact } from "@/lib/ghl/api";
import { ymd } from "@/lib/ghl/estimates";
import { moveDealForEstimate } from "@/lib/estimates/server";
import { saveContact } from "@/lib/sync";
import { easternIso, fmtDateTime } from "@/lib/format";
import { queueNextPlanVisit } from "./server";

export interface JobResult {
  ok?: string;
  error?: string;
  warning?: string;
  id?: string;
}

const errText = (e: unknown) =>
  e instanceof GhlError ? (e.isMissingScope ? "the GHL token is missing a permission (see Settings)" : e.message) : e instanceof Error ? e.message : String(e);

async function loadJob(id: string): Promise<Job | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const db = await getDb();
  const [j] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return j ?? null;
}

async function log(user: CurrentUser, contactId: string, action: string, summary: string) {
  const db = await getDb();
  await db.insert(schema.activity).values({ staffId: user.id, staffName: user.name, action, contactId, summary });
}

function refresh(job: Pick<Job, "id" | "contactId">) {
  revalidatePath(`/jobs/${job.id}`);
  revalidatePath("/jobs");
  revalidatePath("/calendar");
  revalidatePath(`/customers/${job.contactId}`);
}

/** Move the sold deal along with its job (Scheduled / Completed). Plan visits don't touch the deal. */
async function moveDeal(job: Job, stage: RegExp): Promise<string | null> {
  if (job.kind !== "service" || !job.estimateId) return null;
  const db = await getDb();
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, job.estimateId));
  const [c] = await db.select({ name: schema.ghlContacts.name }).from(schema.ghlContacts).where(eq(schema.ghlContacts.id, job.contactId));
  if (!est || !c) return null;
  try {
    await moveDealForEstimate(est, c.name, stage, job.amount);
    return null;
  } catch (e) {
    return `deal not moved (${errText(e)})`;
  }
}

/* ---------------- Schedule ---------------- */

const scheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time"),
  hours: z.number().min(0.5).max(12),
  calendarId: z.string().min(5, "Pick a calendar"),
  assignedUserId: z.string().nullable(),
});

export async function scheduleJob(id: string, input: z.infer<typeof scheduleSchema>): Promise<JobResult> {
  const user = await requireUser();
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the schedule." };
  const v = parsed.data;
  const job = await loadJob(id);
  if (!job) return { error: "That job no longer exists." };
  if (job.status === "completed" || job.status === "cancelled") return { error: `This job is ${job.status}.` };

  const cal = (await listCalendars(true)).find((c) => c.id === v.calendarId);
  if (!cal) return { error: "That calendar doesn't exist in GHL anymore." };
  if (!cal.isActive) return { error: `“${cal.name}” is switched off in GHL. Turn it on in GHL → Calendars, or pick another calendar.` };
  if (v.assignedUserId && !cal.team.includes(v.assignedUserId)) {
    return { error: "That person isn't on this calendar's team in GHL. Add them under GHL → Calendars → Team members, or pick someone else." };
  }

  const start = easternIso(v.date, v.time);
  const end = new Date(new Date(start).getTime() + v.hours * 3600_000).toISOString();
  const title = `Job #${job.number} — ${job.title}`;

  const db = await getDb();
  try {
    if (job.appointmentId) {
      // Moving to another calendar isn't reliable through GHL's update; re-book instead.
      if (job.calendarId !== v.calendarId) {
        await updateAppointment(job.appointmentId, { status: "cancelled" });
        const a = await createAppointment({ calendarId: v.calendarId, contactId: job.contactId, title, start, end, assignedUserId: v.assignedUserId, address: job.address });
        job.appointmentId = a.id;
      } else {
        await updateAppointment(job.appointmentId, { start, end, title, assignedUserId: v.assignedUserId, address: job.address ?? undefined });
      }
    } else {
      const a = await createAppointment({ calendarId: v.calendarId, contactId: job.contactId, title, start, end, assignedUserId: v.assignedUserId, address: job.address });
      job.appointmentId = a.id;
    }
  } catch (e) {
    return { error: `GHL couldn't book it: ${errText(e)}` };
  }

  const wasScheduled = job.status === "scheduled";
  await db
    .update(schema.jobs)
    .set({
      status: job.status === "in_progress" ? "in_progress" : "scheduled",
      scheduledStart: new Date(start),
      scheduledEnd: new Date(end),
      calendarId: v.calendarId,
      appointmentId: job.appointmentId,
      assignedUserId: v.assignedUserId,
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, id));
  const warning = wasScheduled ? null : await moveDeal(job, /^scheduled$/i);
  await log(user, job.contactId, "job.schedule", `${wasScheduled ? "Rescheduled" : "Scheduled"} job #${job.number} for ${fmtDateTime(start)}`);
  refresh(job);
  return { ok: `${wasScheduled ? "Rescheduled" : "Scheduled"} on the GHL calendar for ${fmtDateTime(start)}.`, warning: warning ? `In GHL: ${warning}.` : undefined };
}

export async function unscheduleJob(id: string): Promise<JobResult> {
  const user = await requireUser();
  const job = await loadJob(id);
  if (!job) return { error: "That job no longer exists." };
  if (job.status !== "scheduled") return { error: "Only scheduled jobs can be unscheduled." };
  if (job.appointmentId) {
    try {
      await updateAppointment(job.appointmentId, { status: "cancelled" });
    } catch (e) {
      return { error: `GHL couldn't cancel the appointment: ${errText(e)}` };
    }
  }
  const db = await getDb();
  await db
    .update(schema.jobs)
    .set({ status: "to_schedule", scheduledStart: null, scheduledEnd: null, appointmentId: null, calendarId: null, updatedAt: new Date() })
    .where(eq(schema.jobs.id, id));
  await log(user, job.contactId, "job.unschedule", `Unscheduled job #${job.number} (appointment cancelled in GHL)`);
  refresh(job);
  return { ok: "Unscheduled — the GHL appointment was cancelled." };
}

/* ---------------- Status ---------------- */

export async function setJobStatus(id: string, status: "in_progress" | "completed" | "cancelled"): Promise<JobResult> {
  const user = await requireUser();
  const job = await loadJob(id);
  if (!job) return { error: "That job no longer exists." };
  if (job.status === "completed" || job.status === "cancelled") return { error: `This job is already ${job.status}.` };
  if (status === "in_progress" && job.status !== "scheduled") return { error: "Schedule the job before starting it." };

  const problems: string[] = [];
  const db = await getDb();
  await db
    .update(schema.jobs)
    .set({
      status,
      ...(status === "completed" ? { completedAt: new Date(), completedBy: user.name } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, id));

  let next: Job | null = null;
  if (status === "completed") {
    if (job.appointmentId) {
      try {
        await updateAppointment(job.appointmentId, { status: "showed" });
      } catch (e) {
        problems.push(`appointment not marked done (${errText(e)})`);
      }
    }
    const dealProblem = await moveDeal(job, /^completed$/i);
    if (dealProblem) problems.push(dealProblem);
    next = await queueNextPlanVisit(job);
    // Record the service on the contact.
    try {
      const fields = await db.select().from(schema.ghlCustomFields).where(eq(schema.ghlCustomFields.model, "contact"));
      const id = (k: string) => fields.find((f) => f.fieldKey === k)?.id;
      const cf: { id: string; field_value: string }[] = [];
      const last = id("contact.last_service_date");
      if (last) cf.push({ id: last, field_value: ymd(new Date()) });
      const nxt = id("contact.next_recommended_service_date");
      if (nxt && next?.dueDate) cf.push({ id: nxt, field_value: next.dueDate });
      if (cf.length) await saveContact(await updateContact(job.contactId, { customFields: cf }));
    } catch (e) {
      problems.push(`service dates not written to the contact (${errText(e)})`);
    }
  } else if (status === "cancelled" && job.appointmentId) {
    try {
      await updateAppointment(job.appointmentId, { status: "cancelled" });
    } catch (e) {
      problems.push(`appointment not cancelled (${errText(e)})`);
    }
  }
  if (problems.length) await db.update(schema.jobs).set({ ghlError: problems.join("; ") }).where(eq(schema.jobs.id, id));

  const verb = { in_progress: "Started", completed: "Completed", cancelled: "Cancelled" }[status];
  await log(user, job.contactId, `job.${status}`, `${verb} job #${job.number}${next ? ` · next plan visit due ${next.dueDate}` : ""}`);
  refresh(job);
  return {
    ok: `${verb}.${next ? ` Next plan visit (job #${next.number}) is due ${next.dueDate}.` : ""}`,
    warning: problems.length ? `In GHL: ${problems.join("; ")}.` : undefined,
  };
}

/* ---------------- Checklist & notes ---------------- */

const checklistSchema = z.array(z.object({ text: z.string().trim().min(1).max(200), done: z.boolean() })).max(60);

export async function saveChecklist(id: string, checklist: ChecklistItem[]): Promise<JobResult> {
  await requireUser();
  const parsed = checklistSchema.safeParse(checklist);
  if (!parsed.success) return { error: "Checklist items need text." };
  const job = await loadJob(id);
  if (!job) return { error: "That job no longer exists." };
  const db = await getDb();
  await db.update(schema.jobs).set({ checklist: parsed.data, updatedAt: new Date() }).where(eq(schema.jobs.id, id));
  revalidatePath(`/jobs/${id}`);
  return { ok: "Saved." };
}

export async function saveJobNotes(id: string, notes: string): Promise<JobResult> {
  await requireUser();
  if (notes.length > 5000) return { error: "Notes are too long." };
  const job = await loadJob(id);
  if (!job) return { error: "That job no longer exists." };
  const db = await getDb();
  await db.update(schema.jobs).set({ notes, updatedAt: new Date() }).where(eq(schema.jobs.id, id));
  revalidatePath(`/jobs/${id}`);
  return { ok: "Notes saved." };
}

/* ---------------- Create by hand ---------------- */

const createSchema = z.object({
  contactId: z.string().min(5, "Pick a customer"),
  title: z.string().trim().min(2, "Describe the job").max(200),
  address: z.string().trim().max(300),
  services: z.string().max(2000),
  amount: z.number().min(0).max(1_000_000),
});

export async function createJob(input: z.infer<typeof createSchema>): Promise<JobResult> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the job." };
  const v = parsed.data;
  const db = await getDb();
  const [c] = await db.select({ id: schema.ghlContacts.id }).from(schema.ghlContacts).where(eq(schema.ghlContacts.id, v.contactId));
  if (!c) return { error: "That customer isn't in GHL anymore." };
  const names = v.services.split("\n").map((s) => s.trim()).filter(Boolean);
  const [{ top }] = await db.select({ top: max(schema.jobs.number) }).from(schema.jobs);
  const [row] = await db
    .insert(schema.jobs)
    .values({
      number: (top ?? 1000) + 1,
      contactId: v.contactId,
      kind: "service",
      title: v.title,
      address: v.address || null,
      services: names.map((n) => ({ name: n, detail: "" })),
      amount: v.amount,
      checklist: names.map((n) => ({ text: n, done: false })),
    })
    .returning();
  await log(user, v.contactId, "job.create", `Created job #${row.number}: ${v.title}`);
  refresh(row);
  return { ok: "Job created.", id: row.id };
}
