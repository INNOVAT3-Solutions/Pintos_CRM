"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

export function RecheckButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" disabled={pending} onClick={() => start(() => router.refresh())}>
      <RefreshCw size={14} className={pending ? "animate-spin" : ""} aria-hidden />
      {pending ? "Checking…" : "Recheck"}
    </Button>
  );
}
