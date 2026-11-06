import Link from "next/link";
import { asc } from "drizzle-orm";
import { CheckCircle2, CircleAlert, KeyRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getGhlStatus, type CapabilityCheck } from "@/lib/ghl/status";
import { Card, PageHeader, Pill, SectionLabel } from "@/components/ui";
import { RecheckButton } from "./recheck-button";
import { AddStaffForm, StaffActiveToggle } from "./staff-forms";

export const metadata = { title: "Settings" };

const STATE_PILL: Record<CapabilityCheck["state"], { tone: "good" | "warn" | "bad"; text: string }> = {
  ok: { tone: "good", text: "Connected" },
  missing_scope: { tone: "warn", text: "Needs permission" },
  needs_setup: { tone: "warn", text: "Needs setup in GHL" },
  error: { tone: "bad", text: "Error" },
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

export default async function SettingsPage() {
  const me = await requireUser();
  const [status, staff] = await Promise.all([
    getGhlStatus(),
    me.role === "admin"
      ? getDb().then((db) => db.select().from(schema.staff).orderBy(asc(schema.staff.createdAt)))
      : Promise.resolve([]),
  ]);
  const missing = status.checks.filter((c) => c.state === "missing_scope");

  return (
    <div className="mx-auto max-w-[1040px] px-4 pt-[26px] pb-11 md:px-7">
      <PageHeader title="Settings" subtitle="Prices, maintenance plans, the GoHighLevel connection and who can sign in." />

      <div className="mb-4 grid gap-3.5 sm:grid-cols-2">
        <Link href="/settings/services" className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] hover:border-brand">
          <SectionLabel>Price list</SectionLabel>
          <div className="mt-1 text-[16px] font-extrabold text-ink">Services &amp; prices →</div>
          <div className="text-[12.5px] font-semibold text-muted">What each service costs and how it&apos;s measured.</div>
        </Link>
        <Link href="/settings/plans" className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] hover:border-brand">
          <SectionLabel>Subscriptions</SectionLabel>
          <div className="mt-1 text-[16px] font-extrabold text-ink">Maintenance plans →</div>
          <div className="text-[12.5px] font-semibold text-muted">Plan discount, per-visit pricing, frequencies and terms.</div>
        </Link>
      </div>

      {/* ---- GHL connection ---- */}
      <Card className="mb-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionLabel>GoHighLevel connection</SectionLabel>
            {status.connected && status.account ? (
              <div className="mt-1.5 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-good" aria-hidden />
                <span className="text-[17px] font-extrabold text-ink">{status.account.name}</span>
                <span className="text-[13px] font-semibold text-muted">
                  {[status.account.city, status.account.state].filter(Boolean).join(", ")} · {status.account.timezone}
                </span>
              </div>
            ) : (
              <div className="mt-1.5 flex items-center gap-2 text-bad">
                <CircleAlert size={18} aria-hidden />
                <span className="text-[15px] font-extrabold">Not connected</span>
                <span className="text-[13px] font-semibold">{status.error}</span>
              </div>
            )}
          </div>
          <RecheckButton />
        </div>

        {missing.length > 0 && (
          <div className="mb-4 rounded-xl border border-warn/30 bg-warn-tint p-3.5 text-[13px] font-semibold text-ink">
            <div className="mb-1 flex items-center gap-2 font-extrabold text-warn">
              <KeyRound size={15} aria-hidden /> {missing.length} permission{missing.length > 1 ? "s" : ""} missing on
              the GHL token
            </div>
            In GHL go to <b>Settings → Private Integrations → Pintos CRM → Edit</b>, tick the scopes listed below, save,
            then press <b>Recheck</b>. The token itself doesn&apos;t change.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-soft text-[11px] font-extrabold tracking-[0.8px] text-muted uppercase">
                <th className="py-2 pr-3">Area</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">In GHL now</th>
                <th className="py-2">Used for</th>
              </tr>
            </thead>
            <tbody>
              {status.checks.map((c) => (
                <tr key={c.key} className="border-b border-line-soft align-top last:border-0">
                  <td className="py-2.5 pr-3 font-extrabold text-ink">{c.label}</td>
                  <td className="py-2.5 pr-3">
                    <Pill tone={STATE_PILL[c.state].tone}>{STATE_PILL[c.state].text}</Pill>
                  </td>
                  <td className="py-2.5 pr-3 font-semibold text-ink-2">
                    {c.state === "ok" ? (
                      c.detail
                    ) : c.state === "needs_setup" ? (
                      <span className="text-warn">{c.detail}</span>
                    ) : c.state === "missing_scope" ? (
                      <span>
                        Tick: <code className="rounded bg-hover px-1 text-[12px]">{c.scopes}</code>
                      </span>
                    ) : (
                      <span className="text-bad">{c.detail}</span>
                    )}
                  </td>
                  <td className="py-2.5 font-semibold text-muted">{c.usedFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[11.5px] font-semibold text-faint">
          Checked {dateFmt.format(new Date(status.checkedAt))} ET. The token stays on the server and is never sent to
          the browser.
        </div>
      </Card>

      {/* ---- Staff logins ---- */}
      <Card>
        <SectionLabel>Staff logins</SectionLabel>
        {me.role !== "admin" ? (
          <p className="mt-2 text-[13.5px] font-semibold text-ink-2">Only admins can add or remove logins.</p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line-soft text-[11px] font-extrabold tracking-[0.8px] text-muted uppercase">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Last sign-in</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id} className="border-b border-line-soft last:border-0">
                      <td className="py-2.5 pr-3 font-extrabold text-ink">
                        {s.name} {s.id === me.id && <span className="font-semibold text-muted">(you)</span>}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold text-ink-2">{s.email}</td>
                      <td className="py-2.5 pr-3 font-semibold text-ink-2 capitalize">{s.role}</td>
                      <td className="py-2.5 pr-3 font-semibold text-muted">
                        {s.lastLoginAt ? dateFmt.format(s.lastLoginAt) : "Never"}
                      </td>
                      <td className="py-2.5 text-right">
                        {s.id !== me.id && <StaffActiveToggle id={s.id} active={s.active} />}
                        {!s.active && <Pill tone="neutral">Off</Pill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 border-t border-line-soft pt-4">
              <div className="mb-3 text-[14px] font-extrabold text-ink">Add a login</div>
              <AddStaffForm />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
