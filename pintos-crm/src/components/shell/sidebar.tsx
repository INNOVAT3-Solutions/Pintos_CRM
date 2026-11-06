"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { initials } from "@/lib/format";
import { NAV_GROUPS } from "./nav";


export function Sidebar({
  user,
  badges,
  open,
  onNavigate,
}: {
  user: { name: string; role: "admin" | "staff" };
  badges: Record<string, string>;
  open: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-[224px] shrink-0 flex-col border-r border-line bg-surface px-3 pt-4 pb-3.5 transition-transform md:static md:translate-x-0 ${
        open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      }`}
    >
      <div className="flex justify-center border-b border-line-soft px-1.5 pb-3">
        <Image src="/logo.png" alt="Pinto's Pressure Washing" width={124} height={83} priority style={{ width: "auto", height: "auto" }} />
      </div>

      <nav className="flex-1 overflow-y-auto pt-3" aria-label="Main">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-3 pb-[7px] text-[10px] font-extrabold tracking-[1.8px] text-faint uppercase">
              {group.label}
            </div>
            <div className="flex flex-col gap-[3px]">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-[10px] px-[11px] py-2 text-[13.5px] font-bold ${
                      active ? "bg-brand-tint text-brand-deep" : "text-ink-2 hover:bg-hover"
                    }`}
                  >
                    <Icon size={17} strokeWidth={2} className={active ? "text-brand" : "text-faint"} aria-hidden />
                    <span className="flex-1">{label}</span>
                    {badges[href] && (
                      <span className="rounded-full bg-brand-tint px-2 py-px text-[10.5px] font-extrabold text-brand-badge">
                        {badges[href]}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-[9px] rounded-xl border border-line-soft bg-surface-soft p-2.5">
        <div className="flex size-[34px] items-center justify-center rounded-full bg-gradient-to-b from-brand-hi to-brand text-[13px] font-extrabold text-white">
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-extrabold text-ink">{user.name}</div>
          <div className="text-[11px] font-semibold text-muted capitalize">{user.role}</div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-subtle hover:bg-hover hover:text-ink"
          >
            <LogOut size={16} aria-hidden />
          </button>
        </form>
      </div>
    </aside>
  );
}
