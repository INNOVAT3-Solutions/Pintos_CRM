import type { EstimateDoc } from "@/lib/estimates/document";
import { addMonths, describeLine, frequencyLabel, lineTotal, totals } from "@/lib/estimates/pricing";
import { fmtDate, money } from "@/lib/format";

/**
 * The estimate as a document — what the customer receives as a PDF. Laid out
 * for US Letter; the browser's "Save as PDF" produces the file. Server-rendered,
 * no interactivity, so the preview and the customer's copy are identical.
 */
export function EstimateDocument({ doc }: { doc: EstimateDoc }) {
  const { est, business, customer } = doc;
  const preselected = est.planOffered ? est.planItems.filter((i) => !i.optional) : [];
  const optional = est.planOffered ? est.planItems.filter((i) => i.optional) : [];
  const oneTime = totals(est.lines, null, est.terms);
  const withPlan = preselected.length ? totals(est.lines, preselected, est.terms) : null;
  const accepted = est.status === "accepted" ? est.choice : null;
  const monthName = (m: number) =>
    new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" }).format(addMonths(doc.issued, m));

  return (
    <article className="estimate-doc mx-auto w-full max-w-[8.5in] bg-white px-[0.6in] py-[0.55in] text-[11pt] leading-snug text-[#14283C] shadow-[0_10px_40px_rgba(16,42,67,0.12)] print:max-w-none print:p-0 print:shadow-none">
      {/* Letterhead */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-[#F26F1F] pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- must render identically in print */}
        <img src="/logo.png" alt={business.name} className="h-auto w-[150px]" />
        <div className="text-right text-[9.5pt] leading-relaxed text-[#3D5570]">
          <div className="text-[12pt] font-extrabold text-[#14283C]">{business.name}</div>
          {business.address && <div>{business.address}</div>}
          {business.phone && <div>{business.phone}</div>}
          {business.email && <div>{business.email}</div>}
          {business.website && <div>{business.website}</div>}
        </div>
      </header>

      {/* Title block */}
      <section className="mt-5 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-[24pt] leading-none font-extrabold tracking-tight">ESTIMATE</h1>
          <div className="mt-1 text-[10pt] font-bold text-[#5A6E84]">#{est.number}</div>
          {est.status === "draft" && (
            <div className="mt-2 inline-block rounded border border-[#B7791F] px-2 py-0.5 text-[8.5pt] font-extrabold tracking-wider text-[#B7791F]">
              DRAFT — NOT YET SENT
            </div>
          )}
          {accepted && (
            <div className="mt-2 inline-block rounded border border-[#1F8A5B] px-2 py-0.5 text-[8.5pt] font-extrabold tracking-wider text-[#1F8A5B]">
              ACCEPTED {est.decidedAt ? fmtDate(est.decidedAt).toUpperCase() : ""}
            </div>
          )}
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[10pt]">
          <dt className="font-bold text-[#7A8FA6]">Date</dt>
          <dd className="text-right font-bold">{fmtDate(doc.issued)}</dd>
          <dt className="font-bold text-[#7A8FA6]">Valid until</dt>
          <dd className="text-right font-bold">{fmtDate(doc.validUntil)}</dd>
          <dt className="font-bold text-[#7A8FA6]">Prepared by</dt>
          <dd className="text-right font-bold">{est.createdByName}</dd>
        </dl>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-6 text-[10pt]">
        <div>
          <div className="mb-1 text-[8.5pt] font-extrabold tracking-[0.12em] text-[#7A8FA6] uppercase">Prepared for</div>
          <div className="text-[11pt] font-extrabold">{customer.name}</div>
          {customer.mailing && <div className="text-[#3D5570]">{customer.mailing}</div>}
          {customer.phone && <div className="text-[#3D5570]">{customer.phone}</div>}
          {customer.email && <div className="text-[#3D5570]">{customer.email}</div>}
        </div>
        <div>
          <div className="mb-1 text-[8.5pt] font-extrabold tracking-[0.12em] text-[#7A8FA6] uppercase">Service address</div>
          <div className="font-bold">{doc.serviceAddress ?? "—"}</div>
        </div>
      </section>

      {/* Line items */}
      <table className="mt-6 w-full border-collapse text-[10pt]">
        <thead>
          <tr className="border-b-2 border-[#14283C] text-left text-[8.5pt] font-extrabold tracking-[0.08em] uppercase">
            <th className="py-1.5 pr-3">Service</th>
            <th className="py-1.5 pr-3">Details</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {est.lines.map((l, i) => (
            <tr key={i} className="border-b border-[#E4EAF2] align-top break-inside-avoid">
              <td className="py-2 pr-3 font-extrabold">{l.name}</td>
              <td className="py-2 pr-3 text-[#3D5570]">
                {describeLine(l)}
                {l.minPrice > 0 && lineTotal(l) === l.minPrice && ` (minimum ${money(l.minPrice)})`}
                {l.description && <div className="text-[9pt]">{l.description}</div>}
              </td>
              <td className="py-2 text-right font-bold whitespace-nowrap">{money(lineTotal(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex justify-end">
        <dl className="grid w-[260px] grid-cols-[1fr_auto] gap-y-1 text-[10.5pt]">
          <dt className="font-bold text-[#5A6E84]">Subtotal</dt>
          <dd className="text-right font-bold">{money(oneTime.subtotal)}</dd>
          <dt className="border-t-2 border-[#14283C] pt-1 font-extrabold">{withPlan ? "Total (one-time)" : "Total"}</dt>
          <dd className="border-t-2 border-[#14283C] pt-1 text-right text-[13pt] font-extrabold">{money(oneTime.today)}</dd>
        </dl>
      </div>

      {/* Maintenance plan option */}
      {est.planOffered && (withPlan?.plan || optional.length > 0) && (
        <section className="mt-6 rounded-lg border-2 border-[#F26F1F] p-4 break-inside-avoid">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[13pt] font-extrabold">Option: join {doc.planName}</h2>
            {withPlan && <span className="text-[10pt] font-extrabold text-[#1F8A5B]">Save {withPlan.discountPct}% on today&apos;s service</span>}
          </div>
          {withPlan?.plan ? (
            <>
              <dl className="mt-2 grid w-full max-w-[360px] grid-cols-[1fr_auto] gap-y-0.5 text-[10pt]">
                <dt className="text-[#5A6E84]">Today&apos;s service</dt>
                <dd className="text-right">{money(withPlan.subtotal)}</dd>
                <dt className="text-[#5A6E84]">Plan discount ({withPlan.discountPct}%)</dt>
                <dd className="text-right">−{money(withPlan.discount)}</dd>
                <dt className="font-extrabold">Today with the plan</dt>
                <dd className="text-right font-extrabold">{money(withPlan.today)}</dd>
                <dt className="font-extrabold">Then, every {withPlan.plan.billingMonths === 1 ? "month" : `${withPlan.plan.billingMonths} months`}</dt>
                <dd className="text-right font-extrabold">{money(withPlan.plan.billingAmount)}</dd>
              </dl>
              <table className="mt-3 w-full border-collapse text-[9.5pt]">
                <thead>
                  <tr className="border-b border-[#14283C] text-left text-[8pt] font-extrabold tracking-[0.08em] uppercase">
                    <th className="py-1 pr-3">Included in the plan</th>
                    <th className="py-1 pr-3">How often</th>
                    <th className="py-1 text-right">Per visit</th>
                  </tr>
                </thead>
                <tbody>
                  {preselected.map((p, i) => (
                    <tr key={i} className="border-b border-[#E4EAF2]">
                      <td className="py-1 pr-3 font-bold">{p.name}</td>
                      <td className="py-1 pr-3">{frequencyLabel(p.frequency)}</td>
                      <td className="py-1 text-right">{money(p.perVisit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 text-[9pt] text-[#3D5570]">
                <span className="font-extrabold text-[#14283C]">First year of visits: </span>
                {withPlan.plan.visits.map((v) => `${monthName(v.month)} — ${v.items.join(", ")}`).join(" · ")}
              </div>
            </>
          ) : null}
          {optional.length > 0 && (
            <div className="mt-2 text-[9pt] text-[#3D5570]">
              <span className="font-extrabold text-[#14283C]">Optional add-ons: </span>
              {optional.map((o) => `${o.name} (${money(o.perVisit)} per visit)`).join(" · ")}
            </div>
          )}
          <p className="mt-2 text-[8.5pt] text-[#5A6E84]">
            The plan is billed the same amount every {withPlan?.plan?.billingMonths ?? 3} months
            {est.terms.commitmentMonths ? `, with a ${est.terms.commitmentMonths}-month minimum term` : ""}. Services and visit frequency can be
            adjusted when accepting online.
          </p>
        </section>
      )}

      {accepted && (
        <section className="mt-5 rounded-lg bg-[#E6F5EE] p-3 text-[10pt] break-inside-avoid">
          <span className="font-extrabold">Accepted by {accepted.signedName}</span> — {money(accepted.todayTotal)} for today&apos;s service
          {accepted.joinedPlan ? `, enrolled in ${doc.planName} at ${money(accepted.billingAmount)} every ${accepted.billingMonths} months.` : " (one-time)."}
        </section>
      )}

      {est.notes && (
        <section className="mt-5 text-[10pt] break-inside-avoid">
          <div className="mb-1 text-[8.5pt] font-extrabold tracking-[0.12em] text-[#7A8FA6] uppercase">Notes</div>
          <p className="whitespace-pre-line text-[#3D5570]">{est.notes}</p>
        </section>
      )}

      {/* How to accept */}
      <section className="mt-6 grid grid-cols-2 gap-8 text-[9.5pt] break-inside-avoid">
        <div>
          <div className="mb-1 text-[8.5pt] font-extrabold tracking-[0.12em] text-[#7A8FA6] uppercase">To accept</div>
          <p className="text-[#3D5570]">
            {doc.link ? (
              <>
                Accept online (and choose one-time or the plan) at:
                <br />
                <span className="font-bold break-all text-[#1B6FAE]">{doc.link}</span>
              </>
            ) : (
              "You'll receive a link to review and accept this estimate online."
            )}
          </p>
        </div>
        <div>
          <div className="mt-8 border-t border-[#14283C] pt-1 text-[8.5pt] text-[#5A6E84]">Customer signature &amp; date</div>
        </div>
      </section>

      <footer className="mt-8 border-t border-[#E4EAF2] pt-2 text-center text-[8pt] text-[#7A8FA6]">
        Thank you for choosing {business.name}. Prices valid until {fmtDate(doc.validUntil)}.
      </footer>
    </article>
  );
}
