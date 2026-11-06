import {
  BarChart3,
  Briefcase,
  CalendarDays,
  FileText,
  Filter,
  LayoutGrid,
  MapPin,
  SlidersHorizontal,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
      { href: "/pipeline", label: "Pipeline", icon: Filter },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/estimates", label: "Estimates", icon: FileText },
      { href: "/jobs", label: "Jobs", icon: Briefcase },
      { href: "/measure", label: "Measure", icon: MapPin },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/financials", label: "Financials", icon: BarChart3 },
      { href: "/team", label: "Team", icon: UserPlus },
      { href: "/settings", label: "Settings", icon: SlidersHorizontal },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
