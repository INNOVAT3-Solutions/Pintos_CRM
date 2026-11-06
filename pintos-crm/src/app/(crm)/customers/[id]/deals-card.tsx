"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { saveDeal, type ActionResult } from "@/lib/crm/actions";
import type { PipelineStage } from "@/lib/db/schema";
import { money } from "@/lib/format";
import { Button, Card, Notice, Pill } from "@/components/ui";

export interface DealView {
  id: string;
  name: string;
  value: number;
  status: string;
  stageId: string;
  stageName: string;
  pipelineName: string;
  assignedTo: string | null;
  updated: string;
}

type Pipeline = { id: string; name: string; stages: PipelineStage[] };

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  open: "neutral",
  won: "good",
  lost: "bad",
  abandoned: "warn",
};

export function DealsCard({
  contactId,
  defaultName,
  deals,
  pipelines,
  users,
}: {
  contactId: string;
  defaultName: string;
  deals: DealView[];
  pipelines: Pipeline[];
  users: { id: string; name: string }[];
}) {
  // null = closed, "new" = adding, otherwise the deal id being edited.
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[15px] font-extrabold">Deals</div>
        {editing === null && pipelines.length > 0 && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="cursor-pointer rounded-lg px-2 py-1 text-[12.5px] font-extrabold text-blue hover:bg-hover hover:text-brand"
          >
            + New deal
          </button>
        )}
      </div>

      {editing === "new" && (
        <DealForm
          contactId={contactId}
          deal={null}
          defaultName={defaultName}
          pipelines={pipelines}
          users={users}
          onDone={() => setEditing(null)}
        />
      )}

      {deals.length === 0 && editing !== "new" && (
        <p className="text-[12.5px] font-semibold text-faint">Not in the pipeline yet.</p>
      )}

      <ul>
        {deals.map((d) =>
          editing === d.id ? (
            <li key={d.id} className="border-b border-[#F0F4F9] py-2 last:border-0">
              <DealForm
                contactId={contactId}
                deal={d}
                defaultName={defaultName}
                pipelines={pipelines}
                users={users}
                onDone={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={d.id} className="flex items-start gap-2 border-b border-[#F0F4F9] py-2.5 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-extrabold text-ink">{d.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] font-bold text-muted">
                  <span>{d.stageName}</span>
                  {d.status !== "open" && <Pill tone={STATUS_TONE[d.status] ?? "neutral"}>{d.status}</Pill>}
                  <span className="text-faint">· {d.updated}</span>
                </div>
              </div>
              <span className="rounded-md bg-hover px-2 py-0.5 text-[12.5px] font-extrabold text-ink">{money(d.value)}</span>
              <button
                type="button"
                aria-label={`Edit ${d.name}`}
                onClick={() => setEditing(d.id)}
                disabled={editing !== null}
                className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-subtle hover:bg-hover hover:text-ink disabled:opacity-40"
              >
                <Pencil size={14} aria-hidden />
              </button>
            </li>
          ),
        )}
      </ul>
    </Card>
  );
}

const input =
  "w-full rounded-[10px] border border-line-field bg-surface px-3 py-2 text-[13.5px] font-semibold text-ink focus:border-sky focus:outline-none";
const labelCls = "mb-1 block text-[12px] font-extrabold text-ink-2";

function DealForm({
  contactId,
  deal,
  defaultName,
  pipelines,
  users,
  onDone,
}: {
  contactId: string;
  deal: DealView | null;
  defaultName: string;
  pipelines: Pipeline[];
  users: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [state, setState] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  // An existing deal stays in its pipeline; GHL moves between pipelines are done in GHL.
  const choices = deal ? pipelines.filter((p) => p.stages.some((s) => s.id === deal.stageId)) : pipelines;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveDeal(contactId, deal?.id ?? null, {}, data);
      setState(r);
      if (!r.error) onDone();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2.5 rounded-xl border border-line-soft bg-surface-soft p-3">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <label className="block">
        <span className={labelCls}>Deal name</span>
        <input name="name" required defaultValue={deal?.name ?? defaultName} className={input} />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className={labelCls}>Value ($)</span>
          <input name="value" inputMode="decimal" defaultValue={deal ? String(deal.value) : ""} placeholder="0" className={input} />
        </label>
        <label className="block">
          <span className={labelCls}>Owner</span>
          <select name="assignedTo" defaultValue={deal?.assignedTo ?? ""} className={input}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className={labelCls}>Stage</span>
        <select name="stageId" defaultValue={deal?.stageId ?? choices[0]?.stages[0]?.id} className={input}>
          {choices.map((p) => (
            <optgroup key={p.id} label={p.name}>
              {p.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : deal ? "Save deal" : "Add deal"}
        </Button>
      </div>
    </form>
  );
}
