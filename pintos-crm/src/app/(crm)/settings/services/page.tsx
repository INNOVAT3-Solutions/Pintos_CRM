import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listServices } from "@/lib/estimates/settings";
import { PageHeader } from "@/components/ui";
import { ServicesEditor } from "./services-editor";

export const metadata = { title: "Services & prices" };

export default async function ServicesPage() {
  const me = await requireUser();
  const services = await listServices();
  const flagged = services.filter((s) => s.needsReview).length;
  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-11 md:px-7">
      <Link href="/settings" className="text-[12.5px] font-extrabold text-blue hover:text-brand">
        ← Settings
      </Link>
      <div className="mt-2.5">
        <PageHeader
          title="Services & prices"
          subtitle={`The price list estimates use. ${services.length} services${flagged ? ` · ${flagged} flagged from the import for a quick check` : ""}.`}
        />
      </div>
      <ServicesEditor services={services} canEdit={me.role === "admin"} />
    </div>
  );
}
