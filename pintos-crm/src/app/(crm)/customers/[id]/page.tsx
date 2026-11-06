import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { MeasurementList } from "@/components/measurement-list";
import { Mail, MapPin, Phone } from "lucide-react";
import { getCustomer, getPipelines } from "@/lib/crm/queries";
import { ensureContact, ensureFresh } from "@/lib/sync";
import { fetchNotes, type RawNote } from "@/lib/ghl/api";
import { recentMessages, type Message } from "@/lib/ghl/conversations";
import { TextComposer } from "@/components/text-composer";
import { ago, fmtDate, fmtDateTime, htmlToText, money } from "@/lib/format";
import { Card, PageHeader, Pill, SectionLabel } from "@/components/ui";
import { subtotal } from "@/lib/estimates/pricing";
import { SyncBar } from "@/components/sync-bar";
import { DetailsForm } from "./details-form";
import { DealsCard } from "./deals-card";
import { NotesCard } from "./notes-card";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = await getCustomer((await params).id);
  return { title: c?.contact.name ?? "Customer" };
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sync = await ensureFresh();
  if (!(await ensureContact(id))) notFound(); // fetch directly if it arrived in GHL after the last sync
  const db = await getDb();
  const [profile, pipelines, measurements, estimates, jobs, notes, messages] = await Promise.all([
    getCustomer(id),
    getPipelines(),
    db
      .select()
      .from(schema.measurements)
      .where(eq(schema.measurements.contactId, id))
      .orderBy(desc(schema.measurements.createdAt))
      .limit(10),
    db
      .select()
      .from(schema.estimates)
      .where(eq(schema.estimates.contactId, id))
      .orderBy(desc(schema.estimates.createdAt))
      .limit(10),
    db.select().from(schema.jobs).where(eq(schema.jobs.contactId, id)).orderBy(desc(schema.jobs.createdAt)).limit(15),
    // Notes aren't mirrored; read them live. A GHL hiccup shouldn't break the page.
    fetchNotes(id).then(
      (n) => ({ ok: true as const, notes: n }),
      () => ({ ok: false as const, notes: [] as RawNote[] }),
    ),
    recentMessages(id, 12).then(
      (m) => ({ ok: true as const, list: m }),
      () => ({ ok: false as const, list: [] as Message[] }),
    ),
  ]);
  if (!profile) notFound();
  const { contact: c, deals } = profile;

  const openDeals = deals.filter((d) => d.status === "open");
  const lead = openDeals[0] ?? deals[0];
  const stats = [
    { label: "PIPELINE STAGE", value: lead ? lead.stageName : "Not in pipeline" },
    { label: "OPEN DEAL VALUE", value: money(openDeals.reduce((s, d) => s + d.value, 0)) },
    { label: "CUSTOMER SINCE", value: fmtDate(c.dateAdded) },
    { label: "SOURCE", value: c.source ?? "—" },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-11 md:px-7">
      <Link href="/customers" className="text-[12.5px] font-extrabold text-blue hover:text-brand">
        ← Customers
      </Link>

      <div className="mt-2.5">
        <PageHeader
          title={c.name}
          subtitle={
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {profile.address && (
                <span className="flex items-center gap-1">
                  <MapPin size={13} aria-hidden /> {profile.address}
                </span>
              )}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-blue hover:text-brand">
                  <Phone size={13} aria-hidden /> {c.phone}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-blue hover:text-brand">
                  <Mail size={13} aria-hidden /> {c.email}
                </a>
              )}
            </div>
          }
          actions={
            <>
              <Link
                href={`/estimates/new?contact=${c.id}`}
                className="rounded-[10px] bg-gradient-to-b from-brand-hi to-brand px-[15px] py-[9px] text-[13px] font-extrabold text-white shadow-[var(--shadow-brand)] hover:brightness-105"
              >
                New estimate
              </Link>
              <a
                href="#text"
                className="rounded-[10px] border border-line-field bg-surface px-[15px] py-[9px] text-[13px] font-extrabold text-ink hover:bg-field"
              >
                Send text
              </a>
            </>
          }
        />
      </div>

      <div className="mb-1 -mt-2">
        <SyncBar lastSyncAt={sync.lastSyncAt?.toISOString() ?? null} lastError={sync.lastError} />
      </div>

      <div className="my-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[14px] border border-line bg-surface px-4 py-3.5 shadow-sm">
            <div className="text-[10.5px] font-extrabold tracking-[1px] text-[#8AA0B8]">{s.label}</div>
            <div className="mt-1 truncate font-display text-[21px] font-extrabold text-ink" title={s.value}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <DetailsForm
            contactId={c.id}
            standard={{
              firstName: c.firstName ?? "",
              lastName: c.lastName ?? "",
              email: c.email ?? "",
              phone: c.phone ?? "",
              companyName: c.companyName ?? "",
              address1: c.address1 ?? "",
              city: c.city ?? "",
              state: c.state ?? "",
              postalCode: c.postalCode ?? "",
            }}
            groups={profile.groups}
          />

          <MeasurementList
            title="Measurements"
            rows={measurements}
            action={
              <span className="flex gap-1">
                {measurements.length > 0 && (
                  <Link
                    href={`/estimates/new?contact=${c.id}&from=measure`}
                    className="rounded-lg px-2 py-1 text-[12.5px] font-extrabold text-blue hover:bg-hover hover:text-brand"
                  >
                    Estimate from these
                  </Link>
                )}
                <Link
                  href={`/measure?contact=${c.id}`}
                  className="rounded-lg px-2 py-1 text-[12.5px] font-extrabold text-blue hover:bg-hover hover:text-brand"
                >
                  + Measure
                </Link>
              </span>
            }
          />

          <Card>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[15px] font-extrabold">Estimates</div>
              <Link href={`/estimates/new?contact=${c.id}`} className="rounded-lg px-2 py-1 text-[12.5px] font-extrabold text-blue hover:bg-hover hover:text-brand">
                + New estimate
              </Link>
            </div>
            {estimates.length === 0 ? (
              <p className="text-[12.5px] font-semibold text-faint">No estimates yet.</p>
            ) : (
              <ul>
                {estimates.map((e) => (
                  <li key={e.id}>
                    <Link href={`/estimates/${e.id}`} className="flex items-center gap-3 border-b border-[#F0F4F9] py-2.5 last:border-0 hover:bg-[#F8FAFD]">
                      <span className="w-[52px] text-[12px] font-extrabold text-blue">#{e.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-ink">
                          {e.lines.map((l) => l.name).join(", ")}
                        </span>
                        <span className="block text-[11px] font-bold text-faint">
                          {fmtDate(e.createdAt)}
                          {e.choice?.joinedPlan ? ` · plan ${money(e.choice.billingAmount)} / ${e.choice.billingMonths} mo` : e.planOffered ? " · plan offered" : ""}
                        </span>
                      </span>
                      <Pill tone={e.status === "accepted" ? "good" : e.status === "declined" ? "bad" : e.status === "draft" ? "neutral" : "warn"}>
                        {e.status === "viewed" ? "opened" : e.status}
                      </Pill>
                      <span className="text-[13px] font-extrabold text-ink">{money(e.choice ? e.choice.todayTotal : subtotal(e.lines))}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[15px] font-extrabold">Job history</div>
              <Link href={`/jobs/new?contact=${c.id}`} className="rounded-lg px-2 py-1 text-[12.5px] font-extrabold text-blue hover:bg-hover hover:text-brand">
                + New job
              </Link>
            </div>
            {jobs.length === 0 ? (
              <p className="text-[12.5px] font-semibold text-faint">No jobs yet — accepted estimates become jobs automatically.</p>
            ) : (
              <ul>
                {jobs.map((j) => (
                  <li key={j.id}>
                    <Link href={`/jobs/${j.id}`} className="flex items-center gap-3 border-b border-[#F0F4F9] py-2.5 last:border-0 hover:bg-[#F8FAFD]">
                      <span className="w-[52px] text-[12px] font-extrabold text-blue">#{j.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-ink">{j.title}</span>
                        <span className="block text-[11px] font-bold text-faint">
                          {j.completedAt
                            ? `Done ${fmtDate(j.completedAt)}`
                            : j.scheduledStart
                              ? fmtDateTime(j.scheduledStart)
                              : j.dueDate
                                ? `Due ${fmtDate(`${j.dueDate}T12:00:00`)}`
                                : "Not scheduled"}
                          {j.kind === "plan_visit" ? " · plan visit" : ""}
                        </span>
                      </span>
                      <Pill tone={j.status === "completed" ? "good" : j.status === "cancelled" ? "bad" : j.status === "to_schedule" ? "warn" : "neutral"}>
                        {j.status.replace("_", " ")}
                      </Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          <TextComposer
            contactId={c.id}
            firstName={c.firstName || c.name.split(" ")[0]}
            phone={c.phone}
            dnd={c.dnd}
            templates={["reminder", "followup", "done", "review", "late", "onmyway"]}
          />

          <Card>
            <SectionLabel>Messages (from GHL)</SectionLabel>
            {!messages.ok ? (
              <p className="mt-2 text-[12.5px] font-semibold text-bad">Couldn&apos;t load messages from GHL.</p>
            ) : messages.list.length === 0 ? (
              <p className="mt-2 text-[12.5px] font-semibold text-faint">No texts or emails yet.</p>
            ) : (
              <ul className="mt-2 max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                {messages.list.map((m) => (
                  <li key={m.id} className={`rounded-xl px-3 py-2 ${m.direction === "inbound" ? "mr-6 bg-hover" : "ml-6 bg-[#EAF4FB]"}`}>
                    <div className="flex justify-between gap-2 text-[10.5px] font-extrabold tracking-[0.4px] text-muted uppercase">
                      <span>
                        {m.type.replace("TYPE_", "").toLowerCase()} · {m.direction === "inbound" ? "from customer" : "sent"}
                      </span>
                      <span>{fmtDateTime(m.at)}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-4 text-[12.5px] font-semibold whitespace-pre-line text-ink">{htmlToText(m.body) || "—"}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <DealsCard
            contactId={c.id}
            defaultName={c.name}
            deals={deals.map((d) => ({
              id: d.id,
              name: d.name,
              value: d.value,
              status: d.status,
              stageId: d.stageId,
              stageName: d.stageName,
              pipelineName: d.pipelineName,
              assignedTo: d.assignedTo,
              updated: ago(d.lastStageChangeAt ?? d.updatedAt),
            }))}
            pipelines={pipelines.map((p) => ({ id: p.id, name: p.name, stages: p.stages }))}
            users={profile.users}
          />

          <NotesCard
            contactId={c.id}
            loadFailed={!notes.ok}
            notes={notes.notes
              .slice()
              .sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime())
              .map((n) => ({ id: n.id, body: htmlToText(n.body), when: fmtDateTime(n.dateAdded) }))}
          />

          <Card>
            <SectionLabel>CRM activity</SectionLabel>
            {profile.activity.length === 0 ? (
              <p className="mt-2 text-[12.5px] font-semibold text-faint">No changes made from the CRM yet.</p>
            ) : (
              <ul className="mt-2">
                {profile.activity.map((a) => (
                  <li key={a.id} className="border-b border-[#F0F4F9] py-2 last:border-0">
                    <div className="text-[12.5px] font-semibold text-[#3D5570]">{a.summary}</div>
                    <div className="text-[11px] font-bold text-faint">
                      {a.staffName} · {fmtDateTime(a.at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {c.tags.length > 0 && (
            <Card>
              <SectionLabel>GHL tags</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.tags.map((t) => (
                  <span key={t} className="rounded-md bg-hover px-2 py-0.5 text-[11.5px] font-bold text-ink-2">
                    {t}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
