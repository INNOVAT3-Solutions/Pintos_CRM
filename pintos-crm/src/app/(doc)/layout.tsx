// Full-page views without the CRM sidebar (estimate previews / printable documents). Login still required (middleware).
export const dynamic = "force-dynamic";

export default function DocLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-canvas print:bg-white">{children}</div>;
}
