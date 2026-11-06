import { count, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { TZ } from "@/lib/format";
import { AppShell } from "@/components/shell/app-shell";

// Every CRM screen reads live data for the signed-in person; never cache these pages.
export const dynamic = "force-dynamic";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  // From the local mirror (no GHL call), so the sidebar never slows a page down.
  const [[{ open }], [{ toSchedule }]] = await Promise.all([
    db.select({ open: count() }).from(schema.ghlOpportunities).where(eq(schema.ghlOpportunities.status, "open")),
    db.select({ toSchedule: count() }).from(schema.jobs).where(eq(schema.jobs.status, "to_schedule")),
  ]);

  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: TZ,
  }).format(new Date());

  return (
    <AppShell
      user={{ name: user.name, role: user.role }}
      today={today}
      badges={{
        ...(open ? { "/pipeline": String(open) } : {}),
        ...(toSchedule ? { "/jobs": String(toSchedule) } : {}),
      }}
    >
      {children}
    </AppShell>
  );
}
