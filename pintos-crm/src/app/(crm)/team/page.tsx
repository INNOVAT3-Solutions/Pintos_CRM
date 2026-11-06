import Link from "next/link";
import { asc, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { ensureFresh } from "@/lib/sync";
import { initials } from "@/lib/format";
import { Card, PageHeader, Pill, SectionLabel } from "@/components/ui";
import { StaffLinkSelect } from "./staff-link";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await requireUser();
  await ensureFresh();
  const db = await getDb();
  const [users, staff, upcoming] = await Promise.all([
    db.select().from(schema.ghlUsers).orderBy(asc(schema.ghlUsers.name)),
    db.select().from(schema.staff).orderBy(asc(schema.staff.createdAt)),
    db.select().from(schema.jobs).where(inArray(schema.jobs.status, ["scheduled", "in_progress"])),
  ]);
  const jobsFor = (id: string) => upcoming.filter((j) => j.assignedUserId === id).length;
  const loginFor = (id: string) => staff.find((s) => s.ghlUserId === id);

  return (
    <div className="mx-auto max-w-[1040px] px-4 pt-6 pb-11 md:px-7">
      <PageHeader title="Team" subtitle="Who does the work, and who can sign in." />

      <Card className="mb-4">
        <SectionLabel>Crew in GHL</SectionLabel>
        <p className="mt-1 mb-3 text-[12.5px] font-semibold text-muted">
          GHL appointments can only be assigned to GHL users. To assign jobs to a crew member, add them as a user in GHL → Settings → My Staff, then press
          Sync on any screen.
        </p>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {users.map((u) => {
            const login = loginFor(u.id);
            return (
              <li key={u.id} className="flex items-center gap-3 rounded-xl border border-line-soft bg-surface-soft p-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[#EAF4FB] text-[13px] font-extrabold text-blue">{initials(u.name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-extrabold text-ink">{u.name}</div>
                  <div className="truncate text-[12px] font-semibold text-muted">
                    {u.email ?? "—"} · {u.role ?? "user"}
                  </div>
                  <div className="text-[11.5px] font-bold text-faint">
                    {jobsFor(u.id)} upcoming job{jobsFor(u.id) === 1 ? "" : "s"} · {login ? `CRM login: ${login.name}` : "no CRM login linked"}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {users.length < 2 && (
          <div className="mt-3 rounded-xl bg-warn-tint px-3 py-2.5 text-[12.5px] font-bold text-warn">
            Only {users.length} GHL user so far — every job will be assigned to the same person until the crew is added in GHL.
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>CRM logins</SectionLabel>
        <p className="mt-1 mb-3 text-[12.5px] font-semibold text-muted">
          Link each login to the GHL user it belongs to, so notes and assignments carry their name.{" "}
          {me.role === "admin" && (
            <Link href="/settings" className="font-extrabold text-blue hover:text-brand">
              Add or turn off logins in Settings
            </Link>
          )}
        </p>
        <ul>
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
              <div className="min-w-[180px] flex-1">
                <div className="text-[13.5px] font-extrabold text-ink">
                  {s.name} {!s.active && <Pill tone="neutral">Off</Pill>}
                </div>
                <div className="text-[12px] font-semibold text-muted">
                  {s.email} · {s.role}
                </div>
              </div>
              {me.role === "admin" ? (
                <StaffLinkSelect staffId={s.id} value={s.ghlUserId} users={users.map((u) => ({ id: u.id, name: u.name }))} />
              ) : (
                <span className="text-[12.5px] font-semibold text-muted">{users.find((u) => u.id === s.ghlUserId)?.name ?? "Not linked"}</span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
