import Image from "next/image";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { customerViewProps } from "@/lib/estimates/customer-view";
import { CustomerEstimate } from "./customer-estimate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your estimate · Pinto's Pressure Washing", robots: { index: false, follow: false } };

export default async function PublicEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const [est] = /^[A-Za-z0-9_-]{20,64}$/.test(token)
    ? await db.select().from(schema.estimates).where(eq(schema.estimates.publicToken, token))
    : [];

  const shell = (children: React.ReactNode) => (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-[720px]">
        <div className="mb-5 flex justify-center">
          <Image src="/logo.png" alt="Pinto's Pressure Washing" width={140} height={93} priority style={{ width: "auto", height: "auto" }} />
        </div>
        {children}
        <p className="mt-6 text-center text-[12px] font-semibold text-muted">Questions? Just reply to the message this link came in, or give us a call.</p>
      </div>
    </main>
  );

  if (!est || est.status === "draft") {
    return shell(
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-[var(--shadow-card)]">
        <h1 className="font-display text-[22px] font-extrabold">This estimate isn&apos;t available</h1>
        <p className="mt-1 text-[13.5px] font-semibold text-muted">The link may be incomplete, or the estimate was withdrawn.</p>
      </div>,
    );
  }

  // First open by the customer.
  if (est.status === "sent") {
    await db.update(schema.estimates).set({ status: "viewed", viewedAt: new Date() }).where(eq(schema.estimates.id, est.id));
  }

  return shell(<CustomerEstimate {...(await customerViewProps({ ...est, status: est.status === "sent" ? "viewed" : est.status }))} />);
}
