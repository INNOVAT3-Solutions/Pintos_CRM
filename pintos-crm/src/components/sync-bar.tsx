"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { syncNow } from "@/lib/crm/actions";
import { ago } from "@/lib/format";

/** "Synced 2m ago from GHL · Sync now". Shows the last sync error if GHL couldn't be reached. */
export function SyncBar({ lastSyncAt, lastError }: { lastSyncAt: string | null; lastError: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [, tick] = useState(0);

  // Keep "x ago" current without a reload.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const run = () =>
    start(async () => {
      const r = await syncNow();
      setMsg(r);
      router.refresh();
    });

  const error = msg?.error ?? lastError;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold text-muted">
      {error ? (
        <span className="flex items-center gap-1 text-bad" title={error}>
          <TriangleAlert size={13} aria-hidden /> Couldn&apos;t reach GHL — showing data from {ago(lastSyncAt)}
        </span>
      ) : (
        <span>Synced with GHL {ago(lastSyncAt)}</span>
      )}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 font-extrabold text-blue hover:bg-hover hover:text-brand disabled:opacity-60"
      >
        <RefreshCw size={12} className={pending ? "animate-spin" : ""} aria-hidden />
        {pending ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
