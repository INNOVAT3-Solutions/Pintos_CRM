"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { moveDeal } from "@/lib/crm/actions";
import type { BoardCard } from "@/lib/crm/queries";
import type { PipelineStage } from "@/lib/db/schema";
import { ago, money } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  won: "bg-good-tint text-good",
  lost: "bg-bad-tint text-bad",
};

export function Board({ stages, initialCards }: { stages: PipelineStage[]; initialCards: BoardCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [, start] = useTransition();

  // Fresh server data (after a sync or another person's change) replaces local state.
  useEffect(() => setCards(initialCards), [initialCards]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "error" ? 7000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const byStage = useMemo(() => {
    const m = new Map<string, BoardCard[]>(stages.map((s) => [s.id, []]));
    for (const c of cards) m.get(c.stageId)?.push(c);
    return m;
  }, [cards, stages]);

  const stageName = (id: string) => stages.find((s) => s.id === id)?.name ?? "stage";

  const move = (cardId: string, toStage: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.stageId === toStage || busy.has(cardId)) return;
    const fromStage = card.stageId;

    // Optimistic: move now, put it back if GHL refuses.
    setCards((cs) =>
      cs.map((c) => (c.id === cardId ? { ...c, stageId: toStage, lastStageChangeAt: new Date().toISOString() } : c)),
    );
    setBusy((b) => new Set(b).add(cardId));
    start(async () => {
      const r = await moveDeal(cardId, toStage);
      setBusy((b) => {
        const n = new Set(b);
        n.delete(cardId);
        return n;
      });
      if (r.error) {
        setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, stageId: fromStage } : c)));
        setToast({ tone: "error", text: `Couldn't move “${card.name}”: ${r.error}` });
      } else {
        setToast({ tone: "ok", text: `“${card.contactName ?? card.name}” → ${stageName(toStage)} (saved to GHL)` });
        router.refresh();
      }
    });
  };

  return (
    <>
      <div className="-mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-3 md:-mx-7 md:px-7">
        {stages.map((stage, i) => {
          const list = byStage.get(stage.id) ?? [];
          const total = list.reduce((s, c) => s + c.value, 0);
          const next = stages[i + 1];
          const isOver = overStage === stage.id && dragId !== null;
          return (
            <section
              key={stage.id}
              aria-label={`${stage.name}, ${list.length} deals`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overStage !== stage.id) setOverStage(stage.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setOverStage(null);
                setDragId(null);
                if (id) move(id, stage.id);
              }}
              className={`w-[232px] shrink-0 rounded-[14px] p-2.5 transition-colors ${
                isOver ? "bg-[#DCE8F5] ring-2 ring-sky" : "bg-[#E7EDF4]"
              }`}
            >
              <header className="flex items-baseline justify-between px-1.5 pt-0.5 pb-2.5">
                <h2 className="text-[11.5px] font-extrabold tracking-[0.8px] text-[#3D5570] uppercase">
                  {stage.name} <span className="text-muted">{list.length}</span>
                </h2>
                <span className="text-[11px] font-extrabold text-muted">{total ? money(total) : ""}</span>
              </header>

              <ul className="flex min-h-[60px] flex-col gap-2">
                {list.map((card) => (
                  <li
                    key={card.id}
                    draggable={!busy.has(card.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", card.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(card.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                    className={`rounded-[11px] border border-line bg-surface px-3 py-[11px] shadow-[0_1px_3px_rgba(16,42,67,0.06)] ${
                      busy.has(card.id) ? "opacity-60" : "cursor-grab active:cursor-grabbing"
                    } ${dragId === card.id ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      {card.contactId ? (
                        <Link
                          href={`/customers/${card.contactId}`}
                          draggable={false}
                          className="text-[13px] leading-tight font-extrabold text-ink hover:text-brand"
                        >
                          {card.contactName ?? card.name}
                        </Link>
                      ) : (
                        <span className="text-[13px] leading-tight font-extrabold text-ink">{card.name}</span>
                      )}
                      {next && (
                        <button
                          type="button"
                          title={`Move to ${next.name}`}
                          aria-label={`Move ${card.contactName ?? card.name} to ${next.name}`}
                          disabled={busy.has(card.id)}
                          onClick={() => move(card.id, next.id)}
                          className="flex shrink-0 cursor-pointer items-center rounded-[7px] border border-line-field bg-surface px-1.5 py-0.5 text-blue hover:bg-[#EAF4FB] disabled:opacity-40"
                        >
                          <ArrowRight size={13} aria-hidden />
                        </button>
                      )}
                    </div>
                    {card.contactName && card.name !== card.contactName && (
                      <div className="mt-0.5 text-[11.5px] font-bold text-ink-2">{card.name}</div>
                    )}
                    {card.contactDetail && (
                      <div className="mt-[3px] truncate text-[11.5px] leading-snug font-semibold text-muted">{card.contactDetail}</div>
                    )}
                    <div className="mt-[9px] flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-faint">
                        {ago(card.lastStageChangeAt)}
                        {STATUS_STYLE[card.status] && (
                          <span className={`rounded-full px-1.5 py-px text-[10px] font-extrabold uppercase ${STATUS_STYLE[card.status]}`}>
                            {card.status}
                          </span>
                        )}
                      </span>
                      <span className="rounded-md bg-hover px-[7px] py-0.5 text-[12px] font-extrabold text-ink">{money(card.value)}</span>
                    </div>
                    {card.assignee && <div className="mt-1.5 text-[11px] font-bold text-muted">Owner: {card.assignee}</div>}
                    {/* Touch screens can't drag: a stage picker instead. */}
                    <select
                      aria-label={`Move ${card.contactName ?? card.name} to stage`}
                      value={card.stageId}
                      disabled={busy.has(card.id)}
                      onChange={(e) => move(card.id, e.target.value)}
                      className="mt-2 w-full rounded-[7px] border border-line-field bg-field px-2 py-1 text-[11.5px] font-bold text-ink-2 md:hidden"
                    >
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {toast && (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          className={`fixed bottom-5 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl px-4 py-2.5 text-[13px] font-bold shadow-lg ${
            toast.tone === "error" ? "bg-bad text-white" : "bg-ink text-white"
          }`}
        >
          {toast.text}
        </div>
      )}
    </>
  );
}
