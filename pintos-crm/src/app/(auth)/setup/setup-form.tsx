"use client";

import { useActionState } from "react";
import { setupOwner, type FormState } from "@/lib/auth/actions";
import { Button, Field, Notice } from "@/components/ui";

export function SetupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setupOwner, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="token" value={token} />
      <Field label="Your name" name="name" autoComplete="name" required autoFocus defaultValue={state.values?.name} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        hint="At least 10 characters."
      />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
