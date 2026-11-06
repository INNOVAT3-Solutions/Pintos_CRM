import "server-only";
import { eq, max } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Estimate, EstimateChoice, Job, PlanVisitInfo } from "@/lib/db/schema";
import { addMonths, describeLine, monthsOf } from "@/lib/estimates/pricing";
import { ymd } from "@/lib/ghl/estimates";

/*
 * Job creation rules. Server-only (not a "use server" file), so none of this
 * is callable from a browser directly.
 */

async function nextNumber(): Promise<number> {
  const db = await getDb();
  const [{ top }] = await db.select({ top: max(schema.jobs.number) }).from(schema.jobs);
  return (top ?? 1000) + 1;
}

async function insertJob(values: Omit<typeof schema.jobs.$inferInsert, "number">): Promise<Job> {
  const db = await getDb();
  for (let attempt = 0; ; attempt++) {
    try {
      const [row] = await db.insert(schema.jobs).values({ ...values, number: await nextNumber() }).returning();
      return row;
    } catch (e) {
      if (attempt >= 2) throw e; // a simultaneous insert took the number; retry
    }
  }
}

/** Services due on plan month `m` (counting from the plan's start). */
export function dueAt(items: PlanVisitInfo["items"], m: number) {
  return items.filter((i) => m % monthsOf(i.frequency) === 0);
}

/** The next plan month after `m` that has anything due (there always is one within 12 months). */
function nextVisitMonth(items: PlanVisitInfo["items"], billingMonths: number, m: number) {
  for (let next = m + billingMonths; next <= m + 24; next += billingMonths) {
    if (dueAt(items, next).length) return next;
  }
  return m + billingMonths;
}

export async function createPlanVisit(contactId: string, estimateId: string | null, address: string | null, info: PlanVisitInfo): Promise<Job> {
  const due = dueAt(info.items, info.month);
  return insertJob({
    contactId,
    estimateId,
    kind: "plan_visit",
    title: `Plan visit — ${due.map((i) => i.name).join(", ")}`,
    address,
    services: due.map((i) => ({ name: i.name, detail: "Maintenance plan" })),
    amount: 0,
    status: "to_schedule",
    dueDate: ymd(addMonths(new Date(`${info.start}T12:00:00`), info.month)),
    planVisit: info,
    checklist: due.map((i) => ({ text: i.name, done: false })),
  });
}

/**
 * After a customer accepts: a job for the work they bought today, plus — if
 * they joined a plan — its first visit. Safe to call twice (does nothing if
 * jobs already exist for the estimate).
 */
export async function createJobsForAcceptedEstimate(est: Estimate, choice: EstimateChoice): Promise<Job[]> {
  const db = await getDb();
  const existing = await db.select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.estimateId, est.id));
  if (existing.length) return [];

  const made: Job[] = [];
  made.push(
    await insertJob({
      contactId: est.contactId,
      estimateId: est.id,
      kind: "service",
      title: est.lines.map((l) => l.name).join(", ").slice(0, 200),
      address: est.propertyAddress,
      services: est.lines.map((l) => ({ name: l.name, detail: [describeLine(l), l.description].filter(Boolean).join(" — ") })),
      amount: choice.todayTotal,
      status: "to_schedule",
      checklist: est.lines.map((l) => ({ text: l.name, done: false })),
      notes: est.notes,
    }),
  );

  if (choice.joinedPlan && choice.items.length) {
    const items = choice.items.map((i) => ({ name: i.name, frequency: i.frequency }));
    const start = ymd(est.decidedAt ?? new Date());
    const month = nextVisitMonth(items, choice.billingMonths, 0);
    made.push(await createPlanVisit(est.contactId, est.id, est.propertyAddress, { month, start, billingMonths: choice.billingMonths, items }));
  }
  return made;
}

/** When a plan visit is completed, queue the next one. */
export async function queueNextPlanVisit(job: Job): Promise<Job | null> {
  if (job.kind !== "plan_visit" || !job.planVisit) return null;
  const info = job.planVisit;
  const month = nextVisitMonth(info.items, info.billingMonths, info.month);
  return createPlanVisit(job.contactId, job.estimateId, job.address, { ...info, month });
}
