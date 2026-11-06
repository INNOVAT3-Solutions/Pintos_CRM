import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPlanSettings, listServices, termsFrom } from "@/lib/estimates/settings";
import { ensureContact, ensureFresh } from "@/lib/sync";
import { PageHeader } from "@/components/ui";
import { EstimateBuilder } from "../builder";
import { loadCustomer, loadPrefill } from "../load";

export const metadata = { title: "New estimate" };

export default async function NewEstimatePage({ searchParams }: { searchParams: Promise<{ contact?: string; from?: string }> }) {
  await requireUser();
  const { contact, from } = await searchParams;
  if (contact) {
    await ensureFresh();
    await ensureContact(contact);
  }
  const [services, settings, customer, prefill] = await Promise.all([
    listServices(),
    getPlanSettings(),
    contact ? loadCustomer(contact) : Promise.resolve(null),
    contact ? loadPrefill(contact) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-[1340px] px-4 pt-6 pb-11 md:px-7">
      <Link href="/estimates" className="text-[12.5px] font-extrabold text-blue hover:text-brand">
        ← Estimates
      </Link>
      <div className="mt-2.5">
        <PageHeader title="New estimate" subtitle="Price today's job from the property's measurements, and optionally offer a maintenance plan." />
      </div>
      <EstimateBuilder
        initial={{
          id: null,
          number: null,
          status: "draft",
          customer,
          propertyAddress: prefill?.address ?? customer?.address ?? "",
          lines: [],
          planOffered: false,
          planItems: [],
          notes: "",
          link: null,
          choice: null,
          ghlError: null,
          ghlEstimateId: null,
          ghlScheduleId: null,
        }}
        services={services}
        terms={termsFrom(settings)}
        planName={settings.planName}
        initialPrefill={prefill}
        autofillFromMeasure={from === "measure"}
      />
    </div>
  );
}
