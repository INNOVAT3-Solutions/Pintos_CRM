import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPlanSettings } from "@/lib/estimates/settings";
import { PageHeader } from "@/components/ui";
import { PlanSettingsForm } from "./plan-settings-form";

export const metadata = { title: "Maintenance plans" };

export default async function PlanSettingsPage() {
  const me = await requireUser();
  const settings = await getPlanSettings();
  return (
    <div className="mx-auto max-w-[860px] px-4 pt-6 pb-11 md:px-7">
      <Link href="/settings" className="text-[12.5px] font-extrabold text-blue hover:text-brand">
        ← Settings
      </Link>
      <div className="mt-2.5">
        <PageHeader
          title="Maintenance plans"
          subtitle="How plans are priced and what homeowners can choose. Changes apply to new estimates; ones already sent keep their terms."
        />
      </div>
      <PlanSettingsForm initial={settings} canEdit={me.role === "admin"} />
    </div>
  );
}
