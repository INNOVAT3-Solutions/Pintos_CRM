import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { loadEstimateDoc } from "@/lib/estimates/document";
import { customerViewProps } from "@/lib/estimates/customer-view";
import { EstimateDocument } from "@/components/estimate-document";
import { PrintButton } from "@/components/print-button";
import { CustomerEstimate } from "../../../../e/[token]/customer-estimate";

export const metadata = { title: "Estimate preview" };

/**
 * Staff preview of what the customer receives — works for drafts too.
 *   ?view=pdf  (default) the printable estimate document
 *   ?view=page the customer's online page (Accept/Decline disabled)
 */
export default async function EstimatePreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { view } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est) notFound();
  const showPage = view === "page";

  const tab = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold ${active ? "bg-ink text-white" : "text-ink-2 hover:bg-hover"}`;

  return (
    <>
      <div className="no-print sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-3 px-4 py-2.5">
          <Link href={`/estimates/${est.id}`} className="text-[12.5px] font-extrabold text-blue hover:text-brand">
            ← Back to estimate #{est.number}
          </Link>
          <div className="flex gap-1 rounded-full border border-line bg-surface p-1" role="tablist" aria-label="Preview">
            <Link href={`/estimates/${est.id}/preview`} role="tab" aria-selected={!showPage} className={tab(!showPage)}>
              PDF document
            </Link>
            <Link href={`/estimates/${est.id}/preview?view=page`} role="tab" aria-selected={showPage} className={tab(showPage)}>
              Customer page
            </Link>
          </div>
          <span className="text-[12px] font-bold text-muted">
            {est.status === "draft" ? "Draft — the customer hasn't received this yet." : `Status: ${est.status === "viewed" ? "opened" : est.status}`}
          </span>
          <div className="ml-auto">{!showPage && <PrintButton />}</div>
        </div>
      </div>

      {showPage ? (
        <div className="px-4 py-6">
          <div className="mx-auto max-w-[460px] overflow-hidden rounded-[28px] border-[6px] border-ink bg-canvas px-4 py-5 shadow-[0_20px_60px_rgba(16,42,67,0.25)]">
            <div className="mb-3 text-center text-[11px] font-extrabold tracking-[1px] text-muted">WHAT THE CUSTOMER SEES ON THEIR PHONE</div>
            <CustomerEstimate {...await customerViewProps(est)} preview />
          </div>
        </div>
      ) : (
        <div className="px-4 py-6 print:p-0">
          <EstimateDocument doc={await loadEstimateDoc(est)} />
        </div>
      )}
    </>
  );
}
