import { redirect } from "next/navigation";
import { getCurrentUser, needsSetup } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await needsSetup()) redirect("/setup");
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <>
      <h1 className="font-display text-[24px] font-extrabold text-ink">Sign in</h1>
      <p className="mt-1 mb-5 text-[13.5px] font-semibold text-muted">Pinto&apos;s team CRM</p>
      <LoginForm />
    </>
  );
}
