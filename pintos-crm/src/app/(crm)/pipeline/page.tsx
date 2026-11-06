import Link from "next/link";
import { getBoard } from "@/lib/crm/queries";
import { ensureFresh } from "@/lib/sync";
import { money } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { SyncBar } from "@/components/sync-bar";
import { Board } from "./board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const sync = await ensureFresh();
  const board = await getBoard(p);
  const open = board.cards.filter((c) => c.status === "open");

  return (
    <div className="px-4 pt-6 pb-11 md:px-7">
      <PageHeader
        title="Pipeline"
        subtitle={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {open.length} open deal{open.length === 1 ? "" : "s"} · {money(open.reduce((s, c) => s + c.value, 0))} · drag a
              card or press → to move it
            </span>
            <SyncBar lastSyncAt={sync.lastSyncAt?.toISOString() ?? null} lastError={sync.lastError} />
          </div>
        }
        actions={
          board.pipelines.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {board.pipelines.map((pl) => (
                <Link
                  key={pl.id}
                  href={`/pipeline?p=${pl.id}`}
                  className={`rounded-full border px-[15px] py-[7px] text-[12px] font-extrabold ${
                    pl.id === board.pipeline?.id ? "border-ink bg-ink text-white" : "border-line-field bg-surface text-ink-2 hover:bg-hover"
                  }`}
                >
                  {pl.name}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />

      {board.pipeline ? (
        <Board key={board.pipeline.id} stages={board.pipeline.stages} initialCards={board.cards} />
      ) : (
        <Card className="max-w-[560px]">
          <p className="text-[13.5px] font-semibold text-ink-2">
            No pipelines found in GHL. Create one in GHL under Opportunities → Pipelines, then press Sync now.
          </p>
        </Card>
      )}
    </div>
  );
}
