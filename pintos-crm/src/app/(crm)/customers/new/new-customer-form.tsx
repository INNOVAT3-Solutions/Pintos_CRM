"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { createCustomer, type ActionResult } from "@/lib/crm/actions";
import { Button, Field, Notice, SelectField } from "@/components/ui";

export function NewCustomerForm({ firstStage }: { firstStage: string | null }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult, FormData>(createCustomer, {});
  const v = state.values ?? {};

  useEffect(() => {
    if (state.id) router.push(`/customers/${state.id}`);
  }, [state.id, router]);

  return (
    <form action={action} className="space-y-4">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="ok">{state.ok}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" name="firstName" autoComplete="off" defaultValue={v.firstName} autoFocus />
        <Field label="Last name" name="lastName" autoComplete="off" defaultValue={v.lastName} />
        <Field label="Phone" name="phone" type="tel" defaultValue={v.phone} hint="Include area code." />
        <Field label="Email" name="email" type="email" defaultValue={v.email} />
        <Field label="Company (commercial)" name="companyName" defaultValue={v.companyName} />
        <SelectField label="Customer type" name="customerType" defaultValue={v.customerType ?? ""}>
          <option value="">Not set</option>
          <option value="Residential">Residential</option>
          <option value="Commercial">Commercial</option>
        </SelectField>
      </div>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_0.6fr_0.8fr]">
        <Field label="Street address" name="address1" defaultValue={v.address1} />
        <Field label="City" name="city" defaultValue={v.city} />
        <Field label="State" name="state" defaultValue={v.state ?? "FL"} />
        <Field label="ZIP" name="postalCode" inputMode="numeric" defaultValue={v.postalCode} />
      </div>

      {firstStage && (
        <div className="rounded-xl border border-line-soft bg-surface-soft p-3.5">
          <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-extrabold text-ink">
            <input
              type="checkbox"
              name="addToPipeline"
              defaultChecked={state.values ? v.addToPipeline === "on" : true}
              className="size-4 accent-brand"
            />
            Add to pipeline as a new deal
          </label>
          <div className="mt-1 mb-2.5 pl-6 text-[12px] font-semibold text-muted">Starts in {firstStage}.</div>
          <div className="max-w-[220px] pl-6">
            <Field label="Estimated value (optional)" name="dealValue" inputMode="decimal" placeholder="$0" defaultValue={v.dealValue} />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.push("/customers")}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving to GHL…" : "Create customer"}
        </Button>
      </div>
    </form>
  );
}
