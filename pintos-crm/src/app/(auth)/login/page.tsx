import { redirect } from "next/navigation";
import { getCurrentUser, needsSetup } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await needsSetup()) redirect("/setup");
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <>
      <p className="font-kanit text-[13px] font-extrabold tracking-[1.6px] text-site-orange uppercase italic">Team sign in</p>
      <h1 className="mt-1 font-kanit text-[34px] leading-none font-black text-site-white uppercase italic">Welcome back</h1>
      <p className="mt-2 mb-5 text-[14px] font-medium text-site-muted">Sign in to Pinto&apos;s CRM: customers, estimates, jobs and the schedule.</p>
      <div className="rounded-xl bg-surface p-5">
        <LoginForm />
      </div>
    </>
  );
}
