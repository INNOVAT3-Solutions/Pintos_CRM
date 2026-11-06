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
      <h1 className="font-display text-[24px] font-extrabold text-ink">Create the owner account</h1>
      <p className="mt-1 mb-5 text-[13.5px] font-semibold text-muted">
        This first login is an admin. You can add the rest of the team in Settings afterwards.
      </p>
      <SetupForm token={token} />
    </>
  );
}
