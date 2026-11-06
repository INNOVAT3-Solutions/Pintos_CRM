"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { addStaff, setStaffActive, type FormState } from "@/lib/auth/actions";
import { Button, Field, Notice, SelectField } from "@/components/ui";

export function AddStaffForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addStaff, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="ok">{state.ok}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" name="name" required defaultValue={state.values?.name} />
        <Field label="Email" name="email" type="email" required defaultValue={state.values?.email} />
        <Field
          label="Temporary password"
          name="password"
          type="text"
          autoComplete="off"
          minLength={10}
          required
          hint="At least 10 characters. Share it privately."
        />
        <SelectField label="Role" name="role" defaultValue={state.values?.role ?? "staff"}>
          <option value="staff">Staff — uses the CRM</option>
          <option value="admin">Admin — also manages logins</option>
        </SelectField>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add login"}
      </Button>
    </form>
  );
}

export function StaffActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setStaffActive(id, !active))}
      className="mr-2 cursor-pointer rounded-lg px-2.5 py-1 text-[12px] font-extrabold text-blue hover:bg-hover hover:text-brand disabled:opacity-50"
    >
      {active ? "Turn off" : "Turn on"}
    </button>
  );
}
