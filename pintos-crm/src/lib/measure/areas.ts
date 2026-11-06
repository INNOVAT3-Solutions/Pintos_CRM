import type { Measurement, Surface } from "@/lib/db/schema";
import { SURFACE_LABEL } from "./calc";

const SURFACE_ORDER: Surface[] = ["roof", "house", "driveway", "patio", "walkway", "other"];

/**
 * The current measurement of each named area. Rows must be newest first:
 * re-measuring "Back patio" replaces the old back-patio number, while
 * "Pool deck" (also a patio-type area) keeps its own.
 */
export function currentAreas<T extends Pick<Measurement, "surface" | "label">>(rowsNewestFirst: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rowsNewestFirst) {
    const k = `${r.surface}|${(r.label ?? "").trim().toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.sort((a, b) => SURFACE_ORDER.indexOf(a.surface) - SURFACE_ORDER.indexOf(b.surface));
}

/** "Back patio (patio / pool deck)" or just "Driveway". */
export function areaTitle(m: Pick<Measurement, "surface" | "label">): string {
  const name = m.label?.trim();
  return name ? `${name} (${SURFACE_LABEL[m.surface].toLowerCase()})` : SURFACE_LABEL[m.surface];
}
