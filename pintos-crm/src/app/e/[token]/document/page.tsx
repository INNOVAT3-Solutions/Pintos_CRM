import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { loadEstimateDoc } from "@/lib/estimates/document";
import { EstimateDocument } from "@/components/estimate-document";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estimate · Pinto's Pressure Washing", robots: { index: false, follow: false } };

/** The customer's printable copy (Download PDF from their estimate page). Protected by the same secret link. */
export default async function CustomerEstimateDocument({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const db = await getDb();
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.publicToken, token));
  if (!est || est.status === "draft") notFound();

  return (
    <main className="min-h-dvh bg-canvas print:bg-white">
      <div className="no-print flex items-center justify-center gap-3 px-4 py-3">
        <a href={`/e/${token}`} className="text-[12.5px] font-extrabold text-blue hover:text-brand">
          ← Back to your estimate
        </a>
        <PrintButton label="Save as PDF / Print" />
      </div>
      <div className="px-4 pb-8 print:p-0">
        <EstimateDocument doc={await loadEstimateDoc(est)} />
      </div>
    </main>
  );
}
