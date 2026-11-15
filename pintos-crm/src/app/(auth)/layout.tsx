import { Kanit } from "next/font/google";
import { LoginVisual } from "./login-visual";

// Sign-in and setup check the database on every visit; never pre-render them.
export const dynamic = "force-dynamic";

// The website's display face (pintospressurewashing.com), only used on these screens.
const kanit = Kanit({ subsets: ["latin"], weight: ["800", "900"], style: ["italic"], variable: "--font-kanit-face" });

/**
 * Split screen in the website's brand: Pinto's photos and job videos on the left, the
 * sign-in card on the right, styled like the site's "Book in 30 seconds" quote card.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${kanit.variable} min-h-dvh bg-site-bg text-site-text lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(460px,1fr)]`}>
      <LoginVisual />
      <div className="flex flex-col items-center justify-center px-5 pt-2 pb-10 sm:px-10 lg:min-h-dvh lg:bg-site-bg-2 lg:py-12">
        <div className="w-full max-w-[420px]">
          <div className="rounded-2xl border border-site-line bg-site-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:p-7">
            <div aria-hidden className="-mx-6 -mt-6 mb-6 h-1 rounded-t-2xl bg-gradient-to-r from-site-gold via-site-orange to-site-orange-2 sm:-mx-7 sm:-mt-7" />
            {children}
          </div>
          <p className="mt-6 flex flex-wrap justify-center gap-x-2 gap-y-1 text-center text-[12.5px] font-semibold text-site-muted">
            {["Licensed & insured", "Miami-Dade", "Broward", "Palm Beach", "The Keys"].map((t, i) => (
              <span key={t} className="whitespace-nowrap">
                {i > 0 && <span aria-hidden className="mr-2 text-site-line">·</span>}
                {t}
              </span>
            ))}
          </p>
        </div>
      </div>
    </main>
  );
}
