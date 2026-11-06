import Image from "next/image";

// Sign-in and setup check the database on every visit; never pre-render them.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex justify-center">
          <Image src="/logo.png" alt="Pinto's Pressure Washing" width={150} height={100} priority style={{ width: "auto", height: "auto" }} />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">{children}</div>
      </div>
    </main>
  );
}
