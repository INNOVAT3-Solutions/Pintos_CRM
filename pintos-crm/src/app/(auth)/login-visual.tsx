"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const VIDEO = (name: string) => `https://www.pintospressurewashing.com/Videos/${encodeURIComponent(name)}.mp4`;

type Slide = { kind: "image"; src: string; label: string } | { kind: "video"; src: string; poster: string; label: string };

/** Pinto's own photos (from pintospressurewashing.com, resized into public/login) and job videos, alternating. */
const SLIDES: Slide[] = [
  { kind: "image", src: "/login/roof-soft-washing.webp", label: "Roof soft washing" },
  { kind: "video", src: VIDEO("Rig Set Up"), poster: "/login/rig-set-up.jpg", label: "Rig set-up" },
  { kind: "image", src: "/login/driveway-cleaning.webp", label: "Driveway cleaning" },
  { kind: "video", src: VIDEO("Commercial Building"), poster: "/login/commercial-building.jpg", label: "Commercial building" },
  { kind: "image", src: "/login/commercial-washing.webp", label: "Commercial washing" },
  { kind: "video", src: VIDEO("Driveway Deep Clean"), poster: "/login/driveway-deep-clean.jpg", label: "Driveway deep clean" },
  { kind: "image", src: "/login/deck-fence-cleaning.webp", label: "Deck & fence cleaning" },
];
const PHOTO_MS = 6000;

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** The orange wave from the website's hero (same path and gradient). */
function Swoosh({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1440 180" preserveAspectRatio="none" aria-hidden className={className}>
      <defs>
        <linearGradient id="pintos-swoosh" x1="0" x2="1">
          <stop offset="0" stopColor="#FFB01F" />
          <stop offset=".55" stopColor="#FF6A13" />
          <stop offset="1" stopColor="#FF8A1F" />
        </linearGradient>
      </defs>
      <path d="M0 128C260 132 360 46 640 54s420 70 800-40v40C1060 160 900 104 640 98S280 176 0 170Z" fill="url(#pintos-swoosh)" />
    </svg>
  );
}

function Headline({ size }: { size: "lg" | "sm" }) {
  return (
    <div>
      <span className="inline-block -skew-x-10 bg-site-gold px-3 py-1">
        <span className="inline-block skew-x-10 font-kanit text-[12px] font-extrabold tracking-[1.6px] text-site-bg uppercase italic">
          Pinto&apos;s Pressure Washing
        </span>
      </span>
      <p
        className={cx(
          "mt-4 font-kanit leading-[0.92] font-black tracking-[-0.5px] text-site-white uppercase italic",
          size === "lg" ? "text-[clamp(56px,6vw,92px)]" : "text-[44px]",
        )}
      >
        Restore the
        <br />
        <span className="text-site-orange">Shine.</span>
      </p>
    </div>
  );
}

/**
 * Left half of the sign-in screen: Pinto's photos and job videos take turns (photos for
 * six seconds, videos to the end) with a cross-fade. Phones get one still photo instead,
 * to save their data. Nothing moves by itself for people who ask for reduced motion,
 * and there's always a pause button.
 */
export function LoginVisual() {
  const [wide, setWide] = useState(false);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const elapsed = useRef(0); // ms already shown of the current photo (survives pause)

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setWide(mq.matches);
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const next = () => setActive((i) => (i + 1) % SLIDES.length);
  const slide = SLIDES[active];

  // A new slide starts from the beginning; other videos pause once they've faded out.
  useEffect(() => {
    if (!wide) return;
    elapsed.current = 0;
    setProgress(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    videos.current.forEach((v, i) => {
      if (!v) return;
      if (i === active) v.currentTime = 0;
      else timers.push(setTimeout(() => v.pause(), 700));
    });
    return () => timers.forEach(clearTimeout);
  }, [active, wide]);

  // Play or pause whatever is showing.
  useEffect(() => {
    if (!wide) return;
    if (slide.kind === "video") {
      const v = videos.current[active];
      if (!v) return;
      if (playing) v.play().catch(() => setPlaying(false));
      else v.pause();
      return;
    }
    if (!playing) return;
    const started = performance.now() - elapsed.current;
    const t = setInterval(() => {
      elapsed.current = performance.now() - started;
      const p = elapsed.current / PHOTO_MS;
      if (p >= 1) next();
      else setProgress(p);
    }, 100);
    return () => clearInterval(t);
  }, [active, playing, wide, slide.kind]);

  if (!wide) {
    return (
      <div className="relative h-[30vh] min-h-48 overflow-hidden bg-site-bg lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- local still, sized by CSS */}
        <img src={SLIDES[0].src} alt="" className="size-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-site-bg/70 via-site-bg/20 to-site-bg" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/login/pintos-logo-light.webp" alt="Pinto's Pressure Washing" className="absolute top-5 left-5 w-[132px]" />
        <Swoosh className="absolute inset-x-0 bottom-0 h-10 w-full" />
      </div>
    );
  }

  return (
    <section aria-label="Pinto's Pressure Washing at work" className="relative hidden h-dvh overflow-hidden bg-site-bg lg:sticky lg:top-0 lg:block">
      {SLIDES.map((s, i) => {
        const shown = i === active;
        const soon = i === (active + 1) % SLIDES.length;
        const cls = cx(
          "absolute inset-0 size-full object-cover transition-opacity duration-700 ease-out motion-reduce:transition-none",
          shown ? "opacity-100" : "opacity-0",
        );
        return s.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- local photos, already resized
          <img key={s.src} src={s.src} alt="" aria-hidden decoding="async" loading={shown || soon ? "eager" : "lazy"} className={cls} />
        ) : (
          <video
            key={s.src}
            ref={(el) => {
              videos.current[i] = el;
            }}
            src={s.src}
            poster={s.poster}
            muted
            playsInline
            preload={shown || soon ? "auto" : "none"}
            onEnded={() => shown && next()}
            onError={() => shown && next()}
            onTimeUpdate={(e) => shown && setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
            aria-hidden
            className={cls}
          />
        );
      })}

      {/* Shade so the headline reads on any frame. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-site-bg/90 via-site-bg/45 to-site-bg/10" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-site-bg/90 to-transparent" />

      <div className="relative flex h-full flex-col justify-between p-10 pb-16 xl:p-14 xl:pb-20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/login/pintos-logo-light.webp" alt="Pinto's Pressure Washing" className="w-[180px] xl:w-[200px]" />

        <div className="max-w-[560px]">
          <Headline size="lg" />
          <p className="mt-5 max-w-[420px] text-[17px] leading-relaxed font-medium text-site-text">
            Licensed and insured exterior cleaning, from <span className="whitespace-nowrap">Miami-Dade</span> to the Florida Keys.
          </p>
        </div>

        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <p aria-live="polite" className="font-kanit text-[22px] font-extrabold text-site-white uppercase italic">
              {slide.label}
            </p>
            <div className="mt-3 flex gap-1.5">
              {SLIDES.map((s, i) => (
                <button
                  key={s.src}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show ${s.label}`}
                  aria-current={i === active}
                  className="group relative h-6 w-9 cursor-pointer xl:w-11"
                >
                  <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/25 group-hover:bg-white/40">
                    <span
                      className="block h-full rounded-full bg-site-orange transition-[width] duration-150 ease-linear motion-reduce:transition-none"
                      style={{ width: i < active ? "100%" : i === active ? `${Math.round(progress * 100)}%` : "0%" }}
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause slideshow" : "Play slideshow"}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/30 bg-site-bg/70 text-white hover:border-site-orange hover:text-site-orange focus-visible:outline-2 focus-visible:outline-site-orange"
          >
            {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
          </button>
        </div>
      </div>

      <Swoosh className="pointer-events-none absolute inset-x-0 -bottom-1 h-14 w-full xl:h-16" />
    </section>
  );
}
