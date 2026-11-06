import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getPlanSettings, listServices, termsFrom } from "@/lib/estimates/settings";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { EstimateBuilder } from "../builder";
import { loadPrefill, toBuilder } from "../load";

export const metadata = { title: "Estimate" };

export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est) notFound();

  const [services, settings, initial, prefill] = await Promise.all([
    listServices(),
    getPlanSettings(),
    toBuilder(est),
    loadPrefill(est.contactId),
  ]);

  const timeline = [
    `Created ${fmtDateTime(est.createdAt)} by ${est.createdByName}`,
    est.sentAt && `sent ${fmtDateTime(est.sentAt)}`,
    est.viewedAt && `opened by customer ${fmtDateTime(est.viewedAt)}`,
    est.decidedAt && `${est.status} ${fmtDateTime(est.decidedAt)}`,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1340px] px-4 pt-6 pb-11 md:px-7">
      <Link href="/estimates" className="text-[12.5px] font-extrabold text-blue hover:text-brand">
        ← Estimates
      </Link>
      <div className="mt-2.5">
        <PageHeader title={`Estimate #${est.number}`} subtitle={timeline.join(" · ")} />
      </div>
      <EstimateBuilder
        initial={initial}
        services={services}
        // Once sent, the estimate keeps the plan terms it was sent with.
        terms={est.status === "draft" ? termsFrom(settings) : est.terms}
        planName={settings.planName}
        initialPrefill={prefill}
      />
    </div>
  );
}
