import Link from "next/link";
import { getPipelines } from "@/lib/crm/queries";
import { Card, PageHeader } from "@/components/ui";
import { NewCustomerForm } from "./new-customer-form";

export const metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  const [pipeline] = await getPipelines();
  return (
    <div className="mx-auto max-w-[760px] px-4 pt-6 pb-11 md:px-7">
      <Link href="/customers" className="text-[12.5px] font-extrabold text-blue hover:text-brand">
        ← Customers
      </Link>
      <div className="mt-2.5">
        <PageHeader title="Add customer" subtitle="Creates the contact in GoHighLevel." />
      </div>
      <Card>
        <NewCustomerForm firstStage={pipeline ? `${pipeline.name} → ${pipeline.stages[0]?.name}` : null} />
      </Card>
    </div>
  );
}
