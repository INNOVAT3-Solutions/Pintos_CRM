import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { ensureContact, ensureFresh } from "@/lib/sync";
import { PROPERTY_ADDRESS_KEY } from "@/lib/crm/fields";
import { PageHeader } from "@/components/ui";
import { MeasurementList } from "@/components/measurement-list";
import { MeasureTool, type Customer } from "./measure-tool";

export const metadata = { title: "Measure" };

export default async function MeasurePage({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  await requireUser();
  const { contact: contactId } = await searchParams;
  if (contactId) {
    await ensureFresh();
    await ensureContact(contactId); // a customer added in GHL seconds ago should be measurable right away
  }
  const db = await getDb();

  let customer: Customer | null = null;
  let history: (typeof schema.measurements.$inferSelect)[] = [];
  if (contactId) {
    const [c] = await db.select().from(schema.ghlContacts).where(eq(schema.ghlContacts.id, contactId));
    if (c) {
      const [addrField] = await db
        .select({ id: schema.ghlCustomFields.id })
        .from(schema.ghlCustomFields)
        .where(eq(schema.ghlCustomFields.fieldKey, PROPERTY_ADDRESS_KEY));
      const prop = addrField ? c.custom[addrField.id] : null;
      const mailing = [c.address1, c.city, c.state, c.postalCode].filter(Boolean).join(", ");
      customer = { id: c.id, name: c.name, address: (typeof prop === "string" && prop.trim()) || mailing || null };
      history = await db
        .select()
        .from(schema.measurements)
        .where(eq(schema.measurements.contactId, c.id))
        .orderBy(desc(schema.measurements.createdAt))
        .limit(20);
    }
  }

  return (
    <div className="mx-auto max-w-[1340px] px-4 pt-6 pb-11 md:px-7">
      <PageHeader
        title="Property measure"
        subtitle="Find the address, outline the roof or surface on live satellite imagery, and save the square footage to the customer's property in GHL."
      />
      {/* Remount the tool when switching customer via the URL so its state starts clean. */}
      <MeasureTool key={customer?.id ?? "none"} mapsKey={env().GOOGLE_MAPS_API_KEY} initialCustomer={customer} />
      {customer && (
        <div className="mt-4 max-w-[900px]">
          <MeasurementList title={`Measurements for ${customer.name}`} rows={history} />
        </div>
      )}
    </div>
  );
}
