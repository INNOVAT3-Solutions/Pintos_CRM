import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { listCustomers, type CustomerFilter, type CustomerType } from "@/lib/crm/queries";
import { ensureFresh } from "@/lib/sync";
import { ago, initials, money } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { SyncBar } from "@/components/sync-bar";

export const metadata = { title: "Customers" };

const FILTERS: { key: CustomerFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "residential", label: "Residential" },
  { key: "commercial", label: "Commercial" },
  { key: "pipeline", label: "In pipeline" },
  { key: "new", label: "New this month" },
];

const TYPE_STYLE: Record<NonNullable<CustomerType>, string> = {
  Residential: "bg-[#EAF4FB] text-blue",
  Commercial: "bg-[#F1ECFA] text-[#6D4BA6]",
};

const AVATAR = ["bg-[#EAF4FB] text-blue", "bg-brand-tint text-brand-deep", "bg-[#F1ECFA] text-[#6D4BA6]", "bg-good-tint text-good"];
const avatarFor = (id: string) => AVATAR[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR.length];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? "all") as CustomerFilter;
  const q = sp.q?.trim() ?? "";
  const sync = await ensureFresh();
  const { rows, counts, totals } = await listCustomers({ q, filter });

  const href = (f: CustomerFilter) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f !== "all") p.set("filter", f);
    const s = p.toString();
    return s ? `/customers?${s}` : "/customers";
  };

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-11 md:px-7">
      <PageHeader
        title="Customers"
        subtitle={<SyncBar lastSyncAt={sync.lastSyncAt?.toISOString() ?? null} lastError={sync.lastError} />}
        actions={
          <Link
            href="/customers/new"
            className="rounded-[10px] border border-line-field bg-surface px-4 py-[9px] text-[13px] font-extrabold text-ink shadow-sm hover:bg-field"
          >
            + Add customer
          </Link>
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-x-7 gap-y-3 rounded-2xl bg-gradient-to-br from-navy to-[#16406B] px-5 py-4 shadow-[0_10px_28px_rgba(10,27,46,0.22)] sm:flex sm:items-center">
        <Stat label="Customers" value={String(totals.customers)} color="text-white" />
        <Stat label="New this month" value={String(totals.newThisMonth)} color="text-[#F9A03F]" />
        <Stat label="In pipeline" value={String(totals.inPipeline)} color="text-white" />
        <Stat label="Open deal value" value={money(totals.openValue)} color="text-[#5FCE8F]" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href(f.key)}
            aria-current={filter === f.key ? "page" : undefined}
            className={`rounded-full border px-[15px] py-1.5 text-[12px] font-extrabold ${
              filter === f.key ? "border-ink bg-ink text-white" : "border-line-field bg-surface text-ink-2 hover:bg-hover"
            }`}
          >
            {f.label} <span className="opacity-60">{counts[f.key]}</span>
          </Link>
        ))}
        <form action="/customers" className="relative ml-auto w-full sm:w-[260px]">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <Search size={14} className="pointer-events-none absolute top-[9px] left-3 text-muted" aria-hidden />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, phone, email, address…"
            aria-label="Search customers"
            className="w-full rounded-full border border-line-field bg-surface py-[7px] pr-3 pl-8 text-[12.5px] font-semibold"
          />
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-[2fr_1fr_1.3fr_1fr_0.9fr_24px] gap-2.5 border-b border-line bg-[#F8FAFD] px-5 py-3 text-[10.5px] font-extrabold tracking-[1.2px] text-[#8AA0B8] md:grid">
          <div>CUSTOMER</div>
          <div>TYPE</div>
          <div>PIPELINE STAGE</div>
          <div>ADDED</div>
          <div>OPEN VALUE</div>
          <div />
        </div>

        {rows.length === 0 && (
          <div className="px-5 py-10 text-center text-[13.5px] font-semibold text-muted">
            {q ? (
              <>
                No customers match “{q}”.{" "}
                <Link href="/customers" className="font-extrabold text-blue hover:text-brand">
                  Clear search
                </Link>
              </>
            ) : (
              "No customers in this view yet."
            )}
          </div>
        )}

        {rows.map((c) => (
          <Link
            key={c.id}
            href={`/customers/${c.id}`}
            className="grid grid-cols-[1fr_auto] items-center gap-2.5 border-b border-[#F0F4F9] px-4 py-3.5 last:border-0 hover:bg-[#F8FAFD] md:grid-cols-[2fr_1fr_1.3fr_1fr_0.9fr_24px] md:px-5"
          >
            <div className="flex min-w-0 items-center gap-[11px]">
              <div
                className={`flex size-[34px] shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${avatarFor(c.id)}`}
              >
                {initials(c.name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-extrabold text-ink">{c.name}</div>
                <div className="truncate text-[12px] font-semibold text-[#8AA0B8]">
                  {c.address ?? c.phone ?? c.email ?? "No contact details"}
                </div>
              </div>
            </div>
            <div className="hidden md:block">
              {c.type ? (
                <span className={`rounded-full px-2.5 py-[3px] text-[11px] font-extrabold ${TYPE_STYLE[c.type]}`}>
                  {c.type}
                </span>
              ) : (
                <span className="text-[12px] font-semibold text-faint">—</span>
              )}
            </div>
            <div className="hidden text-[12.5px] font-bold text-ink-2 md:block">{c.deal?.stage ?? "—"}</div>
            <div className="hidden text-[12.5px] font-semibold text-muted md:block">{ago(c.dateAdded)}</div>
            <div className="text-right text-[13.5px] font-extrabold text-ink md:text-left">
              {c.openValue ? money(c.openValue) : <span className="font-semibold text-faint">—</span>}
              <div className="text-[11px] font-bold text-muted md:hidden">{c.deal?.stage}</div>
            </div>
            <ChevronRight size={16} className="hidden text-[#C4D2E0] md:block" aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-[10px] font-extrabold tracking-[1.2px] text-[#8FA9C2] uppercase">{label}</div>
      <div className={`font-display text-[22px] font-extrabold ${color}`}>{value}</div>
    </div>
  );
}
