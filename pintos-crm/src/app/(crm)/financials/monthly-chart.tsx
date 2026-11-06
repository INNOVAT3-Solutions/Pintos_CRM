"use client";

import { useState } from "react";
import type { MonthRow } from "@/lib/financials/server";
import { money } from "@/lib/format";

/**
 * Work completed vs expenses per month — grouped columns on one money axis.
 * Colors are the brand blue/orange (validated for colour-blind separation;
 * orange is under 3:1 on white, so the same numbers are always in the table below).
 */
const SERIES = [
  { key: "work", label: "Work completed", color: "#1B6FAE" },
  { key: "expenses", label: "Expenses", color: "#F26F1F" },
] as const;

const W = 640;
const H = 230;
const PAD = { top: 12, right: 8, bottom: 26, left: 52 };
const BAR = 22; // ≤ 24px
const GAP = 2; // surface gap between a month's two columns
const R = 4; // rounded data-end

function niceMax(v: number) {
  if (v <= 0) return 100;
  const raw = v / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  return step * 4;
}
const tick = (v: number) => (v >= 10_000 ? `$${Math.round(v / 1000)}K` : `$${v.toLocaleString("en-US")}`);

/** Column with only the top corners rounded (square at the baseline). */
function column(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(R, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function MonthlyChart({ rows }: { rows: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...rows.flatMap((r) => [r.work, r.expenses])));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / rows.length;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-[12px] font-bold text-ink-2" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Work completed and expenses by month, last six months. Values are in the table below.">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#E4EAF2" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fontWeight={700} fill="#7A8FA6">
                {tick(t)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const cx = PAD.left + band * i + band / 2;
            const x0 = cx - BAR - GAP / 2;
            return (
              <g
                key={r.key}
                tabIndex={0}
                role="button"
                aria-label={`${r.label}: work completed ${money(r.work)}, expenses ${money(r.expenses)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="cursor-default outline-none"
              >
                {/* hit area: the whole month band, bigger than the marks */}
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill={hover === i ? "#F3F6FA" : "transparent"} />
                {SERIES.map((s, k) => {
                  const v = r[s.key];
                  return <path key={s.key} d={column(x0 + k * (BAR + GAP), y(v), BAR, y(0) - y(v))} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.55} />;
                })}
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="#5A6E84">
                  {r.label}
                </text>
              </g>
            );
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#C9D6E4" strokeWidth={1} />
        </svg>
        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 min-w-[170px] rounded-xl border border-line bg-surface px-3 py-2 shadow-[var(--shadow-card)]"
            style={{ left: `clamp(0px, calc(${((PAD.left + band * hover + band / 2) / W) * 100}% - 85px), calc(100% - 170px))` }}
          >
            <div className="mb-1 text-[11px] font-extrabold tracking-[0.6px] text-muted uppercase">{rows[hover].label}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="flex items-center gap-1.5 font-semibold text-ink-2">
                  <span className="h-[2px] w-3" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-extrabold text-ink">{money(rows[hover][s.key])}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-line-soft pt-1 text-[12px]">
              <span className="font-semibold text-ink-2">Difference</span>
              <span className="font-extrabold text-ink">{money(rows[hover].work - rows[hover].expenses)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Table view: every value, no hover needed. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-right text-[12.5px]">
          <caption className="sr-only">Monthly totals</caption>
          <thead>
            <tr className="border-b border-line-soft text-[10.5px] font-extrabold tracking-[0.8px] text-muted uppercase">
              <th className="py-1.5 text-left">Month</th>
              <th className="py-1.5">Work completed</th>
              <th className="py-1.5">Collected (GHL)</th>
              <th className="py-1.5">Expenses</th>
              <th className="py-1.5">Work − expenses</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line-soft font-semibold text-ink-2 last:border-0">
                <td className="py-1.5 text-left font-extrabold text-ink">{r.label}</td>
                <td className="py-1.5">{money(r.work)}</td>
                <td className="py-1.5">{money(r.collected)}</td>
                <td className="py-1.5">{money(r.expenses)}</td>
                <td className="py-1.5 font-extrabold text-ink">{money(r.work - r.expenses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
