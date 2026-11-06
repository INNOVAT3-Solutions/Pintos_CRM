"use client";

/// <reference types="google.maps" />
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { LatLng, Surface } from "@/lib/db/schema";
import { getContactProperties, saveMeasurement, type PropertyOption } from "@/lib/measure/actions";
import { computeMeasurement, pitchFactor, pitchFromDegrees, PITCHES, SURFACE_LABEL, type HouseMethod } from "@/lib/measure/calc";
import { Notice } from "@/components/ui";
import { CustomerPicker } from "@/components/customer-picker";
import { loadGoogleMaps } from "./load-maps";

const DEFAULT_CENTER = { lat: 25.6668, lng: -80.3081 }; // Pinecrest / Miami

/** Map color for each kind of area (saved areas stay on the map in these). */
const SURFACE_COLOR: Record<Surface, string> = {
  roof: "#C2510A",
  house: "#6D4BA6",
  driveway: "#2E9BD6",
  patio: "#1F8A5B",
  walkway: "#B7791F",
  other: "#94A3B8",
};
const AREA_EXAMPLE: Record<Surface, string> = {
  roof: "e.g. Main roof, Garage roof",
  house: "e.g. Main house",
  driveway: "e.g. Front driveway",
  patio: "e.g. Back patio, Pool deck",
  walkway: "e.g. Front walkway, Sidewalk",
  other: "e.g. Fence, Screen enclosure",
};
const ORANGE = "#F26F1F";
const SKY = "#2E9BD6";

export type { Customer } from "@/components/customer-picker";
import type { Customer } from "@/components/customer-picker";

interface Address {
  formatted: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
}

interface Solar {
  sqft: number;
  segments: number;
  pitch: number;
  box: google.maps.LatLngBoundsLiteral | null;
}

const EMPTY_ADDR: Address = { formatted: "", line1: "", city: "", state: "", zip: "" };

function addressFrom(r: google.maps.GeocoderResult): Address {
  const part = (type: string, short = false) => {
    const c = r.address_components.find((x) => x.types.includes(type));
    return c ? (short ? c.short_name : c.long_name) : "";
  };
  return {
    formatted: r.formatted_address,
    // Short form ("SW 62nd Ct"), matching how the formatted address writes the street.
    line1: [part("street_number"), part("route", true)].filter(Boolean).join(" "),
    city: part("locality") || part("sublocality") || part("postal_town"),
    state: part("administrative_area_level_1", true),
    zip: part("postal_code"),
  };
}

const field =
  "w-full rounded-lg border border-[#2A4A6C] bg-white px-2.5 py-2 text-[13px] font-bold text-ink focus:outline-none focus:ring-2 focus:ring-sky";
const darkLabel = "mb-1 block text-[11px] font-extrabold tracking-[0.6px] text-[#8FA9C2] uppercase";
const toolBtn =
  "cursor-pointer rounded-lg border border-[#C9D6E4] bg-white px-[13px] py-2 text-[12.5px] font-bold text-ink hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50";

export function MeasureTool({ mapsKey, initialCustomer }: { mapsKey: string; initialCustomer: Customer | null }) {
  const router = useRouter();

  /* ---------------- customer & property ---------------- */
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
  const [props, setProps] = useState<{ list: PropertyOption[]; canLink: boolean; problem?: string } | null>(null);
  const [propertyId, setPropertyId] = useState("new");

  useEffect(() => {
    setProps(null);
    setPropertyId("new");
    if (!customer) return;
    let live = true;
    getContactProperties(customer.id).then((r) => {
      if (!live) return;
      setProps({ list: r.properties, canLink: r.canLink, problem: r.problem });
      if (r.properties[0]) setPropertyId(r.properties[0].id);
    });
    return () => {
      live = false;
    };
  }, [customer]);

  /* ---------------- map ---------------- */
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const shape = useRef<google.maps.Polygon | google.maps.Polyline | null>(null);
  const solarBox = useRef<google.maps.Rectangle | null>(null);
  const [ready, setReady] = useState(false);
  const [mapErr, setMapErr] = useState("");

  const [query, setQuery] = useState(initialCustomer?.address ?? "");
  const [address, setAddress] = useState<Address>(EMPTY_ADDR);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);

  const [points, setPoints] = useState<LatLng[]>([]);
  const [closed, setClosed] = useState(false);

  // No default: Nick picks what he's measuring (driveway, back patio, roof…) each time.
  const [surface, setSurface] = useState<Surface | null>(null);
  const [areaLabel, setAreaLabel] = useState("");
  // Areas saved during this visit stay on the map so he can measure the next one.
  const [sessionAreas, setSessionAreas] = useState<{ surface: Surface; label: string; sqft: number; points: LatLng[] }[]>([]);
  const savedShapes = useRef<google.maps.Polygon[]>([]);
  const [pitch, setPitch] = useState(6);
  const [stories, setStories] = useState(1);
  const [houseMethod, setHouseMethod] = useState<HouseMethod>("siding");
  const [solar, setSolar] = useState<Solar | null>(null);
  const [useSolar, setUseSolar] = useState(false);
  const [solarBusy, setSolarBusy] = useState(false);
  const [solarErr, setSolarErr] = useState("");

  // Keep latest values reachable from Google's event listeners.
  const closedRef = useRef(closed);
  closedRef.current = closed;

  useEffect(() => {
    if (!mapsKey) return;
    let cancelled = false;
    loadGoogleMaps(mapsKey, () =>
      setMapErr(
        "Google rejected the Maps key for this address. In Google Cloud → Credentials, add http://localhost:3100/* (and the live site later) to the key's website restrictions.",
      ),
    )
      .then((gm) => {
        if (cancelled || !mapEl.current || map.current) return;
        map.current = new gm.Map(mapEl.current, {
          center: DEFAULT_CENTER,
          zoom: 12,
          mapTypeId: "satellite",
          tilt: 0,
          heading: 0,
          rotateControl: false,
          streetViewControl: false,
          clickableIcons: false,
          fullscreenControl: true,
          mapTypeControl: true,
          mapTypeControlOptions: { mapTypeIds: ["satellite", "hybrid", "roadmap"] },
          gestureHandling: "greedy",
          draggableCursor: "crosshair",
        });
        map.current.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng || closedRef.current) return;
          const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          setPoints((ps) => [...ps, p]);
          setUseSolar(false);
        });
        setReady(true);
      })
      .catch((e: Error) => setMapErr(e.message));
    return () => {
      cancelled = true;
    };
  }, [mapsKey]);

  // Redraw the outline whenever points/closed change.
  useEffect(() => {
    const gm = typeof google !== "undefined" ? google.maps : null;
    if (!gm || !map.current) return;
    if (shape.current) {
      gm.event.clearInstanceListeners(shape.current.getPath());
      gm.event.clearInstanceListeners(shape.current);
      shape.current.setMap(null);
      shape.current = null;
    }
    if (!points.length) return;
    const isClosed = closed && points.length >= 3;
    const opts = { map: map.current, path: points, strokeColor: ORANGE, strokeOpacity: 1, strokeWeight: 3, editable: true, clickable: true };
    const s = isClosed ? new gm.Polygon({ ...opts, fillColor: ORANGE, fillOpacity: 0.28 }) : new gm.Polyline(opts);
    shape.current = s;
    const path = s.getPath();
    if (!isClosed) {
      s.addListener("click", (e: google.maps.PolyMouseEvent) => {
        if (e.vertex === 0 && path.getLength() >= 3) setClosed(true);
        else if (e.vertex == null && e.latLng) {
          const ll = e.latLng;
          setPoints((ps) => [...ps, { lat: ll.lat(), lng: ll.lng() }]);
        }
      });
    }
    // Right-click a corner to delete it.
    s.addListener("contextmenu", (e: google.maps.PolyMouseEvent) => {
      if (e.vertex != null && path.getLength() > (isClosed ? 3 : 1)) path.removeAt(e.vertex);
    });
    // Dragging corners edits the outline.
    const sync = () => setPoints(path.getArray().map((p) => ({ lat: p.lat(), lng: p.lng() })));
    (["set_at", "insert_at", "remove_at"] as const).forEach((ev) => path.addListener(ev, sync));
  }, [points, closed, ready]);

  // Areas already saved this visit, each in its surface's color.
  useEffect(() => {
    savedShapes.current.forEach((p) => p.setMap(null));
    savedShapes.current = [];
    if (!map.current || typeof google === "undefined") return;
    for (const a of sessionAreas) {
      if (a.points.length < 3) continue;
      savedShapes.current.push(
        new google.maps.Polygon({
          map: map.current,
          paths: a.points,
          clickable: false,
          strokeColor: SURFACE_COLOR[a.surface],
          strokeWeight: 2,
          fillColor: SURFACE_COLOR[a.surface],
          fillOpacity: 0.25,
        }),
      );
    }
  }, [sessionAreas, ready]);

  // Google Solar's building box.
  useEffect(() => {
    solarBox.current?.setMap(null);
    solarBox.current = null;
    if (!map.current || !solar?.box || typeof google === "undefined") return;
    solarBox.current = new google.maps.Rectangle({
      map: map.current,
      bounds: solar.box,
      clickable: false,
      strokeColor: SKY,
      strokeWeight: 2,
      fillColor: SKY,
      fillOpacity: 0.12,
    });
  }, [solar, ready]);

  const measureRoofWithSolar = useCallback(
    async (at: LatLng | null) => {
      const c =
        points.length > 0
          ? { lat: points.reduce((a, p) => a + p.lat, 0) / points.length, lng: points.reduce((a, p) => a + p.lng, 0) / points.length }
          : at;
      if (!c) {
        setSolarErr("Find the property first.");
        return;
      }
      setSolarBusy(true);
      setSolarErr("");
      try {
        const r = await fetch(
          `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${c.lat}&location.longitude=${c.lng}&requiredQuality=LOW&key=${encodeURIComponent(mapsKey)}`,
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message ?? "request failed");
        const sp = j.solarPotential ?? {};
        const whole = sp.wholeRoofStats ?? {};
        const segs: { stats?: { areaMeters2?: number }; pitchDegrees?: number }[] = sp.roofSegmentStats ?? [];
        if (!whole.areaMeters2) throw new Error("no roof data for this building");
        let w = 0;
        let p = 0;
        for (const s of segs) {
          const a = s.stats?.areaMeters2 ?? 0;
          w += a;
          p += a * (s.pitchDegrees ?? 0);
        }
        const bb = j.boundingBox;
        const next: Solar = {
          sqft: Math.round(whole.areaMeters2 * 10.7639),
          segments: Math.max(1, segs.length),
          pitch: pitchFromDegrees(w ? p / w : 0),
          box: bb ? { south: bb.sw.latitude, west: bb.sw.longitude, north: bb.ne.latitude, east: bb.ne.longitude } : null,
        };
        setSolar(next);
        setPitch(next.pitch);
        if (!closedRef.current) setUseSolar(true);
      } catch (e) {
        setSolar(null);
        setUseSolar(false);
        setSolarErr(`Google Solar couldn't measure this roof (${(e as Error).message}). Outline it by hand instead.`);
      } finally {
        setSolarBusy(false);
      }
    },
    [mapsKey, points],
  );

  const locate = () => {
    const q = query.trim();
    if (!q || typeof google === "undefined") return;
    setBusy(true);
    setMapErr("");
    new google.maps.Geocoder().geocode({ address: q, region: "us" }, (res, status) => {
      setBusy(false);
      if (status !== "OK" || !res?.length) {
        setMapErr(
          status === "ZERO_RESULTS"
            ? "No match for that address. Add the city and state."
            : `Address lookup failed (${status}). Make sure the Geocoding API is enabled for the key.`,
        );
        return;
      }
      const loc = res[0].geometry.location;
      const c = { lat: loc.lat(), lng: loc.lng() };
      map.current?.setCenter(c);
      map.current?.setZoom(20);
      setCenter(c);
      setAddress(addressFrom(res[0]));
      setPoints([]);
      setClosed(false);
      setSolar(null);
      setUseSolar(false);
      setSolarErr("");
      if (surface === "roof") void measureRoofWithSolar(c);
    });
  };

  // Look up the customer's address automatically once the map is ready.
  const autoLocated = useRef(false);
  useEffect(() => {
    if (ready && !autoLocated.current && query.trim()) {
      autoLocated.current = true;
      locate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /* ---------------- live numbers ---------------- */
  const usingSolar = surface === "roof" && useSolar && !!solar && !closed;
  const result = useMemo(
    () =>
      computeMeasurement({
        surface: surface ?? "other",
        points: closed ? points : [],
        pitch,
        stories,
        houseMethod,
        solar: usingSolar && solar ? { sqft: solar.sqft, segments: solar.segments } : null,
      }),
    [surface, points, closed, pitch, stories, houseMethod, usingSolar, solar],
  );

  const hint = !surface && ready && mapsKey
    ? "First pick what you're measuring →"
    : solarBusy
    ? "Google is measuring the roof…"
    : !mapsKey
      ? "No Google Maps key configured"
      : !ready
        ? "Loading satellite map…"
        : closed
          ? "Drag corners to fine-tune · right-click a corner to delete it"
          : points.length
            ? "Click each corner · click the first point to close"
            : usingSolar
              ? "Blue box = building Google measured · click corners to outline it yourself instead"
              : center
                ? "Zoom in and click the first corner of the surface"
                : "Search an address, or pan to the property";

  /* ---------------- save ---------------- */
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState<{ ok?: string; warning?: string; error?: string } | null>(null);

  // A "saved" message belongs to the measurement it was for; clear it once anything changes
  // (except the reset that follows a save, so the confirmation stays visible).
  const keepMessage = useRef(false);
  useEffect(() => {
    if (keepMessage.current) {
      keepMessage.current = false;
      return;
    }
    setSaved(null);
  }, [surface, points, closed, pitch, stories, houseMethod, useSolar, customer]);

  const canSave = !!customer && !!surface && result.sqft > 0 && (closed || usingSolar);
  const save = () => {
    if (!customer) return;
    setSaved(null);
    startSave(async () => {
      if (!surface) return;
      const r = await saveMeasurement({
        contactId: customer.id,
        propertyId,
        surface,
        label: areaLabel.trim(),
        points: closed ? points : [],
        pitch,
        stories,
        houseMethod,
        solar: usingSolar && solar ? { sqft: solar.sqft, segments: solar.segments } : null,
        address,
        center,
      });
      setSaved(r);
      if (!r.error) {
        // Keep it on the map, then get ready for the next area.
        setSessionAreas((xs) => [...xs, { surface, label: areaLabel.trim(), sqft: result.sqft, points: closed ? points : [] }]);
        keepMessage.current = true;
        setPoints([]);
        setClosed(false);
        setUseSolar(false);
        setAreaLabel("");
        setSurface(null);
      }
      if (r.propertyId && propertyId === "new") {
        setPropertyId(r.propertyId);
        getContactProperties(customer.id).then((p) => setProps({ list: p.properties, canLink: p.canLink, problem: p.problem }));
      }
      router.refresh();
    });
  };

  const resetShape = () => {
    setPoints([]);
    setClosed(false);
    setUseSolar(false);
  };

  return (
    <div className="grid items-start gap-3.5 xl:grid-cols-[1fr_320px]">
      {/* ---- map card ---- */}
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            locate();
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Property address"
            placeholder="Property address — e.g. 7420 SW 62nd Ct, Pinecrest, FL"
            className="min-w-0 flex-1 rounded-lg border border-[#C9D6E4] px-3 py-2 text-[13px] font-semibold"
          />
          <button
            type="submit"
            disabled={!ready || busy}
            className="cursor-pointer rounded-lg bg-blue px-4 py-2 text-[13px] font-extrabold whitespace-nowrap text-white hover:bg-sky disabled:opacity-60"
          >
            {busy ? "Finding…" : "Find"}
          </button>
        </form>

        <div className="relative h-[60vh] min-h-[360px] overflow-hidden rounded-[10px] bg-[#0F2740] md:h-[520px]">
          <div ref={mapEl} className="absolute inset-0" data-testid="map" />
          <div className="pointer-events-none absolute top-2.5 left-1/2 z-[1] max-w-[92%] -translate-x-1/2 truncate rounded-[7px] bg-navy/85 px-2.5 py-[5px] text-[11px] font-bold text-[#CDDDEE]">
            {hint}
          </div>
          {mapErr && (
            <div role="alert" className="absolute top-14 right-14 left-2.5 z-[1] rounded-[7px] bg-[#B42318] px-2.5 py-[7px] text-[12px] font-bold text-white">
              {mapErr}
            </div>
          )}
          {address.formatted && (
            <div className="pointer-events-none absolute bottom-6 left-2.5 z-[1] max-w-[80%] truncate rounded-[7px] bg-brand px-2.5 py-[5px] text-[11px] font-extrabold text-white">
              {address.formatted}
            </div>
          )}
          {!mapsKey && (
            <div className="absolute inset-0 z-[2] flex items-center justify-center bg-gradient-to-br from-navy to-[#16406B] p-6 text-center text-[13px] font-semibold text-[#CDDDEE]">
              Add GOOGLE_MAPS_API_KEY to the .env file and restart the CRM to use satellite measuring.
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={toolBtn} disabled={!points.length} onClick={() => { setPoints((p) => p.slice(0, -1)); setClosed(false); }}>
            Undo point
          </button>
          <button type="button" className={toolBtn} disabled={!points.length} onClick={resetShape}>
            Clear
          </button>
          <button
            type="button"
            disabled={points.length < 3 || closed}
            onClick={() => setClosed(true)}
            className="cursor-pointer rounded-lg bg-ink px-[13px] py-2 text-[12.5px] font-bold text-white hover:bg-blue disabled:cursor-not-allowed disabled:opacity-40"
          >
            Close shape
          </button>
          <span className="text-[12px] font-bold text-[#8AA0B8]">
            {points.length ? `${points.length} point${points.length > 1 ? "s" : ""}${closed ? " · closed" : ""}` : ""}
          </span>
          <span className="ml-auto text-[11.5px] font-semibold text-[#8AA0B8]">Live satellite · geodesic area</span>
        </div>
      </div>

      {/* ---- results panel ---- */}
      <div className="flex flex-col gap-3.5">
        <CustomerPicker customer={customer} onChange={setCustomer} />

        <div className="rounded-2xl bg-gradient-to-br from-navy to-[#16406B] p-[18px] shadow-[0_10px_28px_rgba(10,27,46,0.22)]">
          <div className="text-[11px] font-extrabold tracking-[1px] text-[#8FA9C2]">MEASURED AREA</div>
          <div className="my-1 font-display text-[32px] font-extrabold text-[#F9A03F]" data-testid="measured-area">
            {result.sqft > 0 ? `${result.sqft.toLocaleString("en-US")} sq ft` : "—"}
          </div>
          {result.method && (
            <div className="mb-3 rounded-lg bg-white/[0.06] px-2.5 py-[7px] text-[11.5px] leading-snug font-bold text-[#CDDDEE]">{result.method}</div>
          )}

          <fieldset className="mb-2.5">
            <legend className={darkLabel}>What are you measuring?</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(SURFACE_LABEL) as Surface[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={surface === s}
                  onClick={() => setSurface(s)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[12px] font-extrabold ${
                    surface === s ? "border-[#F9A03F] bg-white text-ink" : "border-[#2A4A6C] text-[#CDDDEE] hover:bg-white/5"
                  }`}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: SURFACE_COLOR[s] }} aria-hidden />
                  {SURFACE_LABEL[s]}
                </button>
              ))}
            </div>
          </fieldset>
          {surface && (
            <label className="mb-2.5 block">
              <span className={darkLabel}>Name this area (optional)</span>
              <input
                value={areaLabel}
                onChange={(e) => setAreaLabel(e.target.value)}
                maxLength={60}
                placeholder={AREA_EXAMPLE[surface]}
                className={field}
              />
            </label>
          )}

          {surface === "roof" && (
            <>
              <label className="mb-2.5 block">
                <span className={darkLabel}>Roof pitch</span>
                <select value={pitch} onChange={(e) => setPitch(Number(e.target.value))} className={field}>
                  {PITCHES.map((p) => (
                    <option key={p} value={p}>
                      {p === 0 ? "Flat / low slope" : `${p}/12`} (×{pitchFactor(p).toFixed(3)})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!ready || solarBusy}
                onClick={() => measureRoofWithSolar(center)}
                className="mb-2.5 w-full cursor-pointer rounded-lg border border-[#2A4A6C] py-2 text-[12.5px] font-extrabold text-[#CDDDEE] hover:bg-white/5 disabled:opacity-50"
              >
                {solarBusy ? "Measuring with Google Solar…" : solar ? "Re-measure with Google Solar" : "Measure roof with Google Solar"}
              </button>
              {solar && (
                <div className="mb-2.5 rounded-lg border border-brand/35 bg-brand/12 px-2.5 py-2">
                  <div className="mb-1.5 text-[11.5px] leading-snug font-bold text-[#F9C08A]">
                    Google Solar: {solar.sqft.toLocaleString("en-US")} sq ft across {solar.segments} roof planes, ~{solar.pitch}/12 pitch.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      resetShape();
                      setUseSolar(true);
                    }}
                    disabled={usingSolar}
                    className="w-full cursor-pointer rounded-[7px] bg-brand py-[7px] text-[12px] font-extrabold text-white disabled:cursor-default disabled:bg-good"
                  >
                    {usingSolar ? "Using Google's roof number ✓" : "Use Google's roof number"}
                  </button>
                </div>
              )}
              {solarErr && <div className="mb-2.5 text-[11.5px] leading-snug font-bold text-[#F0A9B8]">{solarErr}</div>}
            </>
          )}

          {surface === "house" && (
            <>
              <label className="mb-2.5 block">
                <span className={darkLabel}>House measure</span>
                <select value={houseMethod} onChange={(e) => setHouseMethod(e.target.value as HouseMethod)} className={field}>
                  <option value="siding">Wall area (perimeter × wall height)</option>
                  <option value="living">Living area (footprint × stories)</option>
                </select>
              </label>
              <label className="mb-2.5 block">
                <span className={darkLabel}>Stories</span>
                <select value={stories} onChange={(e) => setStories(Number(e.target.value))} className={field}>
                  <option value={1}>1 story</option>
                  <option value={2}>2 stories</option>
                  <option value={3}>3 stories</option>
                </select>
              </label>
            </>
          )}

          {sessionAreas.length > 0 && (
            <div className="mb-2.5 rounded-lg bg-white/[0.06] px-2.5 py-2" data-testid="session-areas">
              <div className="mb-1 text-[11px] font-extrabold tracking-[0.6px] text-[#8FA9C2] uppercase">Saved this visit</div>
              {sessionAreas.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[12px] font-bold text-[#CDDDEE]">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: SURFACE_COLOR[a.surface] }} aria-hidden />
                    {a.label || SURFACE_LABEL[a.surface]}
                  </span>
                  <span className="text-white">{a.sqft.toLocaleString("en-US")} sq ft</span>
                </div>
              ))}
            </div>
          )}

          {customer && sessionAreas.length > 0 && (
            <Link
              href={`/estimates/new?contact=${customer.id}&from=measure`}
              className="mb-2.5 flex w-full items-center justify-center rounded-lg border border-[#F9A03F] py-2 text-[12.5px] font-extrabold text-[#F9C08A] hover:bg-white/5"
            >
              Start estimate from {sessionAreas.length > 1 ? `these ${sessionAreas.length} areas` : "this area"} →
            </Link>
          )}

          {customer && props && (
            <label className="mb-2.5 block">
              <span className={darkLabel}>Save to property</span>
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={field}>
                {props.list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value="new">+ New property{address.formatted ? ` at ${address.line1 || address.formatted}` : ""}</option>
              </select>
            </label>
          )}
          {customer && props && !props.canLink && (
            <div className="mb-2.5 text-[11.5px] leading-snug font-bold text-[#F9C08A]">{props.problem}</div>
          )}

          <button
            type="button"
            onClick={save}
            disabled={!canSave || saving}
            className="w-full cursor-pointer rounded-lg bg-gradient-to-b from-brand-hi to-brand py-2.5 text-[13px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving to GHL…"
              : !customer
                ? "Pick a customer to save"
                : !surface
                  ? "Pick what you're measuring"
                  : `Save ${areaLabel.trim() || SURFACE_LABEL[surface].toLowerCase()} to ${customer.name}`}
          </button>
          {saved?.error && <div className="mt-2.5"><Notice tone="error">{saved.error}</Notice></div>}
          {saved?.ok && <div className="mt-2.5"><Notice tone="ok">{saved.ok}</Notice></div>}
          {saved?.warning && (
            <div role="status" className="mt-2.5 rounded-[10px] bg-warn-tint px-3 py-2.5 text-[12.5px] font-bold text-warn">
              {saved.warning}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
