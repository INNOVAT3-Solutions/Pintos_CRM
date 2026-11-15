"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Filter, LayoutGrid, MapPin, Users } from "lucide-react";

/** Phone-only tab bar: the five screens field staff use most, in thumb reach. Everything else is in the top menu. */
const TABS = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid },
  { href: "/pipeline", label: "Pipeline", icon: Filter },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/measure", label: "Measure", icon: MapPin },
];

export function BottomNav({ badges }: { badges: Record<string, string> }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Quick"
      className="no-print shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-[58px] flex-col items-center justify-center gap-[3px] text-[10.5px] font-extrabold ${
                  active ? "text-brand-deep" : "text-muted"
                }`}
              >
                {active && <span className="absolute top-0 h-[3px] w-7 rounded-b-full bg-brand" aria-hidden />}
                <Icon size={21} strokeWidth={active ? 2.4 : 2} className={active ? "text-brand" : "text-faint"} aria-hidden />
                {label}
                {badges[href] && (
                  <span className="absolute top-[7px] left-[calc(50%+6px)] min-w-[17px] rounded-full bg-brand px-1 text-center text-[10px] leading-[17px] text-white">
                    {badges[href]}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
