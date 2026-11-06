/**
 * Measuring math, shared by the browser (live numbers while drawing) and the
 * server (which recomputes from the outline before anything is saved, so the
 * stored numbers never depend on what a browser claims).
 *
 * Area and length use the same spherical formulas and Earth radius as Google
 * Maps' geometry library, so results match what the map shows.
 */
import type { LatLng, Surface } from "@/lib/db/schema";

const EARTH_RADIUS_M = 6378137;
const SQFT_PER_SQM = 10.7639;
const FT_PER_M = 3.28084;
/** Wall height assumed per story when estimating siding area (as in the approved prototype). */
export const WALL_FT_PER_STORY = 10;

const rad = (d: number) => (d * Math.PI) / 180;

/** Signed area of a closed path on the sphere, in m² (Google's computeSignedArea). */
function signedAreaM2(path: LatLng[]): number {
  if (path.length < 3) return 0;
  let total = 0;
  const prev = path[path.length - 1];
  let prevTanLat = Math.tan((Math.PI / 2 - rad(prev.lat)) / 2);
  let prevLng = rad(prev.lng);
  for (const p of path) {
    const tanLat = Math.tan((Math.PI / 2 - rad(p.lat)) / 2);
    const lng = rad(p.lng);
    const dLng = lng - prevLng;
    const t = tanLat * prevTanLat;
    total += 2 * Math.atan2(t * Math.sin(dLng), 1 + t * Math.cos(dLng));
    prevTanLat = tanLat;
    prevLng = lng;
  }
  return total * EARTH_RADIUS_M * EARTH_RADIUS_M;
}

/** Great-circle distance in metres (haversine). */
function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function areaSqft(path: LatLng[]): number {
  return Math.abs(signedAreaM2(path)) * SQFT_PER_SQM;
}

/** Perimeter of the closed outline (or length of an open line) in feet. */
export function perimeterFt(path: LatLng[], closed = true): number {
  if (path.length < 2) return 0;
  let m = 0;
  for (let i = 1; i < path.length; i++) m += distanceM(path[i - 1], path[i]);
  if (closed && path.length >= 3) m += distanceM(path[path.length - 1], path[0]);
  return m * FT_PER_M;
}

/** Slope multiplier for a roof pitch given as rise per 12" run. */
export const pitchFactor = (pitch: number) => Math.sqrt(1 + (pitch / 12) ** 2);

export const PITCHES = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12] as const;

/** Nearest standard pitch to a slope in degrees (used for Google Solar results). */
export function pitchFromDegrees(deg: number): number {
  const rise = Math.tan(rad(deg)) * 12;
  return PITCHES.reduce((best, p) => (Math.abs(p - rise) < Math.abs(best - rise) ? p : best), 0 as number);
}

export type HouseMethod = "siding" | "living";

export interface MeasureInput {
  surface: Surface;
  points: LatLng[];
  /** Roof: rise per 12. */
  pitch: number;
  /** House: 1–3. */
  stories: number;
  houseMethod: HouseMethod;
  /** Roof from Google Solar instead of an outline. */
  solar?: { sqft: number; segments: number } | null;
}

export interface MeasureResult {
  /** Headline number for the chosen surface. */
  sqft: number;
  footprintSqft: number;
  perimeterFt: number;
  /** House only: footprint × stories. */
  livingSqft: number | null;
  /** Plain-English description of how the number was produced. */
  method: string;
}

const n = (x: number) => Math.round(x).toLocaleString("en-US");

export function computeMeasurement(input: MeasureInput): MeasureResult {
  const { surface, points, pitch, stories, houseMethod, solar } = input;
  const footprint = points.length >= 3 ? areaSqft(points) : 0;
  const perim = points.length >= 3 ? perimeterFt(points) : 0;
  const base = { footprintSqft: Math.round(footprint), perimeterFt: Math.round(perim), livingSqft: null as number | null };

  if (surface === "roof" && solar && points.length < 3) {
    return { ...base, sqft: Math.round(solar.sqft), method: `Google Solar: sloped area of all ${solar.segments} roof planes` };
  }
  if (footprint <= 0) return { ...base, sqft: 0, method: "" };

  switch (surface) {
    case "roof": {
      const f = pitchFactor(pitch);
      return {
        ...base,
        sqft: Math.round(footprint * f),
        method: `Footprint ${n(footprint)} sq ft × ${f.toFixed(3)} (${pitch ? `${pitch}/12 pitch` : "flat"})`,
      };
    }
    case "house": {
      const living = Math.round(footprint * stories);
      const storyLabel = `${stories} ${stories > 1 ? "stories" : "story"}`;
      if (houseMethod === "siding") {
        const wallFt = WALL_FT_PER_STORY * stories;
        return {
          ...base,
          livingSqft: living,
          sqft: Math.round(perim * wallFt),
          method: `Walls: perimeter ${n(perim)} ft × ${wallFt} ft (${storyLabel} × ${WALL_FT_PER_STORY} ft)`,
        };
      }
      return { ...base, livingSqft: living, sqft: living, method: `Living area: footprint ${n(footprint)} sq ft × ${storyLabel}` };
    }
    default:
      return { ...base, sqft: Math.round(footprint), method: `Flat surface · perimeter ${n(perim)} ft` };
  }
}

export const SURFACE_LABEL: Record<Surface, string> = {
  roof: "Roof",
  house: "House",
  driveway: "Driveway",
  patio: "Patio / pool deck",
  walkway: "Walkway / sidewalk",
  other: "Other area",
};

/** Display name for a measured area: its own name if given, else the surface type. */
export const areaName = (m: { surface: Surface; label?: string | null }) => m.label?.trim() || SURFACE_LABEL[m.surface];
