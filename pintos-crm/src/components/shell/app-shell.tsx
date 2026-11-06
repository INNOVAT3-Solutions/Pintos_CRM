"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
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
        <header className="flex h-[58px] shrink-0 items-center gap-3.5 border-b border-line bg-white/85 px-4 backdrop-blur md:px-[22px]">
          <button
            aria-label="Open menu"
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink-2 hover:bg-hover md:hidden"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={20} aria-hidden />
          </button>
          <GlobalSearch />
          <div className="flex-1" />
          <div className="hidden text-[12px] font-bold text-muted sm:block">{today}</div>
          <Link
            href="/estimates/new"
            className="rounded-[10px] bg-gradient-to-b from-brand-hi to-brand px-4 py-[9px] text-[13px] font-extrabold whitespace-nowrap text-white shadow-[var(--shadow-brand)] hover:brightness-105"
          >
            + New estimate
          </Link>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
