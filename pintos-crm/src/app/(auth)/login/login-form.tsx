"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/lib/auth/actions";
import { Button, Field, Notice } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus={!state.values?.email}
        defaultValue={state.values?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus={!!state.values?.email}
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
