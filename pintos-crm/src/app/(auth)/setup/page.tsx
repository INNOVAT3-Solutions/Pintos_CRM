import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/auth";
import { SetupForm } from "./setup-form";

export const metadata = { title: "First-time setup" };

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  // Only reachable before the first account exists; afterwards admins add people in Settings.
  if (!(await needsSetup())) redirect("/login");
  const { token = "" } = await searchParams;
  return (
    <>
      <p className="font-kanit text-[13px] font-extrabold tracking-[1.6px] text-site-orange uppercase italic">First-time setup</p>
      <h1 className="mt-1 font-kanit text-[30px] leading-none font-black text-site-white uppercase italic">Create the owner account</h1>
      <p className="mt-2 mb-5 text-[14px] font-medium text-site-muted">
        This first login is an admin. You can add the rest of the team in Settings afterwards.
      </p>
      <div className="rounded-xl bg-surface p-5">
        <SetupForm token={token} />
      </div>
    </>
  );
}
