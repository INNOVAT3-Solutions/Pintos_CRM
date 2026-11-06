"use client";

import { Printer } from "lucide-react";

/** Opens the browser's print dialog — choose "Save as PDF" to get the file. */
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex cursor-pointer items-center gap-1.5 rounded-[10px] bg-gradient-to-b from-brand-hi to-brand px-4 py-2 text-[13px] font-extrabold text-white shadow-[var(--shadow-brand)] hover:brightness-105"
    >
      <Printer size={15} aria-hidden /> {label}
    </button>
  );
}
