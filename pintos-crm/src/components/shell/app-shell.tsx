"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Plus, Search, X } from "lucide-react";
import { BottomNav } from "./bottom-nav";
import { GlobalSearch } from "./global-search";
import { Sidebar } from "./sidebar";

export function AppShell({
  user,
  today,
  badges,
  children,
}: {
  user: { name: string; role: "admin" | "staff" };
  today: string;
  /** Small counters next to nav items, keyed by href. */
  badges: Record<string, string>;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  // Leaving a page closes the phone search row.
  useEffect(() => setSearchOpen(false), [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <Sidebar user={user} badges={badges} open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      {menuOpen && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-navy/30 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print shrink-0 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="flex h-[60px] items-center gap-1.5 px-2 md:gap-3.5 md:px-[22px]">
            {/* Phones: menu · Pintos brand · search · new estimate */}
            <button
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-hover md:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={24} aria-hidden />
            </button>
            <Link href="/dashboard" aria-label="Pinto's Pressure Washing — dashboard" className="flex min-w-0 items-center md:hidden">
              <Image src="/logo.png" alt="" width={124} height={83} priority className="h-[46px] w-auto" />
            </Link>

            <div className="hidden min-w-0 flex-1 md:flex">
              <GlobalSearch />
            </div>
            <div className="flex-1 md:hidden" />
            <div className="hidden text-[12px] font-bold text-muted lg:block">{today}</div>

            <button
              aria-label={searchOpen ? "Close search" : "Search customers"}
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-hover md:hidden"
            >
              {searchOpen ? <X size={22} aria-hidden /> : <Search size={22} aria-hidden />}
            </button>
            <Link
              href="/estimates/new"
              aria-label="New estimate"
              className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-brand-hi to-brand text-[13px] font-extrabold whitespace-nowrap text-white shadow-[var(--shadow-brand)] hover:brightness-105 md:size-auto md:px-4 md:py-[9px]"
            >
              <Plus size={22} strokeWidth={2.6} className="md:hidden" aria-hidden />
              <span className="hidden md:inline">+ New estimate</span>
            </Link>
          </div>

          {searchOpen && (
            <div className="flex border-t border-line-soft px-3 py-2.5 md:hidden">
              <GlobalSearch autoFocus onDone={() => setSearchOpen(false)} />
            </div>
          )}
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">{children}</main>

        <BottomNav badges={badges} />
      </div>
    </div>
  );
}
