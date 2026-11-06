import type { Measurement } from "@/lib/db/schema";
import { areaTitle } from "@/lib/measure/areas";
import { fmtDateTime } from "@/lib/format";
import { Card, Pill } from "@/components/ui";

/** A customer's measurements, newest first, with whether each reached GHL. */
export function MeasurementList({ title, rows, action }: { title: string; rows: Measurement[]; action?: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[15px] font-extrabold">{title}</div>
        {action}
      </div>
      {rows.length === 0 ? (
        <p className="text-[12.5px] font-semibold text-faint">No measurements yet.</p>
      ) : (
        <ul>
          {rows.map((m) => (
            <li key={m.id} className="border-b border-line-soft py-2.5 last:border-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-extrabold text-ink">{areaTitle(m)}</span>
                <span className="text-[13px] font-extrabold whitespace-nowrap text-brand">{m.sqft.toLocaleString("en-US")} sq ft</span>
              </div>
              <div className="text-[11.5px] font-semibold text-ink-2">{m.method}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-faint">
                <span>
                  {fmtDateTime(m.createdAt)} · {m.staffName}
                  {m.address ? ` · ${m.address.split(",")[0]}` : ""}
                </span>
                {m.ghlSyncedAt ? (
                  <Pill tone="good">In GHL</Pill>
                ) : (
                  <span title={m.ghlError ?? undefined}>
                    <Pill tone="warn">CRM only</Pill>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
