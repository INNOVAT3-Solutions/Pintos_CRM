import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ensureContact } from "@/lib/sync";
import { Card, PageHeader } from "@/components/ui";
import { loadCustomer } from "../../estimates/load";
import { NewJobForm } from "./new-job-form";

export const metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  await requireUser();
  const { contact } = await searchParams;
  if (contact) await ensureContact(contact);
  const customer = contact ? await loadCustomer(contact) : null;
  return (
    <div className="mx-auto max-w-[760px] px-4 pt-6 pb-11 md:px-7">
      <Link href="/jobs" className="text-[12.5px] font-extrabold text-blue hover:text-brand">
        ← Jobs
      </Link>
      <div className="mt-2.5">
        <PageHeader title="New job" subtitle="For work that didn't come from an estimate — a callback, a quick add-on, a warranty touch-up." />
      </div>
      <Card>
        <NewJobForm initialCustomer={customer} />
      </Card>
    </div>
  );
}
