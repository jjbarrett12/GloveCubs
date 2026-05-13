import Link from "next/link";
import { Upload, ListChecks, BadgeCheck, FileQuestion, RefreshCw, Headphones, Mail, Phone } from "lucide-react";
import { SITE_PHONE_TEL_HREF, SITE_SALES_MAILTO_HREF } from "@/config/siteContact";

const sectionShell = "border-t border-white/10 px-4 py-16 sm:px-6 sm:py-20 lg:px-8";

export function HomeHowInvoiceWorksSection() {
  const steps = [
    { n: "1", title: "Upload", body: "Send a PDF or clear photo of your glove invoice.", icon: Upload },
    { n: "2", title: "We review & match", body: "We extract line items and map them to real catalog options.", icon: ListChecks },
    { n: "3", title: "See alternates", body: "Where they apply, you’ll see governed alternates—not random substitutes.", icon: BadgeCheck },
    { n: "4", title: "Quote or reorder", body: "Request formal pricing or keep buying from what you approved.", icon: FileQuestion },
  ] as const;

  return (
    <section
      id="how-invoice-works"
      className={`${sectionShell} scroll-mt-28 bg-[#121212]`}
      aria-labelledby="how-invoice-heading"
    >
      <div className="mx-auto max-w-7xl">
        <h2 id="how-invoice-heading" className="mb-3 text-center text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          Invoice upload (optional)
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-base leading-relaxed text-white/75">
          When you want us to map what you already buy—four straightforward steps. Prefer to shop cold? Use the catalog above.
        </p>
        <ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ n, title, body, icon: Icon }) => (
            <li
              key={n}
              className="rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f06232] text-sm font-bold text-white">
                  {n}
                </span>
                <Icon className="h-6 w-6 text-[#f06232]" aria-hidden />
              </div>
              <h3 className="mb-2 text-lg font-bold text-white">{title}</h3>
              <p className="m-0 text-sm leading-relaxed text-white/70">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function HomeRecommendationExplainerSection() {
  return (
    <section
      className={`${sectionShell} bg-gradient-to-b from-[#161616] to-[#121212]`}
      aria-labelledby="explainer-heading"
    >
      <div className="mx-auto max-w-3xl text-center lg:max-w-4xl">
        <h2 id="explainer-heading" className="mb-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          When we suggest a swap, it is deliberate
        </h2>
        <div className="space-y-4 text-left text-base leading-relaxed text-white/80 sm:text-[17px]">
          <p>
            We only surface alternates that clear our review rules for your category—not every lookalike SKU on the market.
            Pack sizes and units are lined up so comparisons stay honest.
          </p>
          <p>
            If you do not see an option, it is because we have not cleared it for your use case yet. Fewer, vetted paths beat a wall
            of unreviewed substitutes.
          </p>
        </div>
        <div className="mt-10">
          <Link
            href="/invoice-savings"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#f06232] to-[#f06232] px-8 py-3.5 text-base font-bold text-white shadow-[0_4px_14px_rgba(240, 98, 50,0.25)] transition hover:-translate-y-0.5"
          >
            Upload an invoice
          </Link>
        </div>
      </div>
    </section>
  );
}

export function HomeReorderSimplificationSection() {
  return (
    <section className={`${sectionShell} bg-[#121212]`} aria-labelledby="reorder-heading">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 id="reorder-heading" className="mb-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Keep the same story on repeat buys
            </h2>
            <p className="mb-6 text-base leading-relaxed text-white/75">
              Once you have approved lines, your quote request cart and bulk request tools carry the same SKUs forward—so monthly restocks
              do not start from a blank spreadsheet.
            </p>
            <ul className="space-y-3 text-sm leading-relaxed text-white/85">
              <li className="flex gap-2">
                <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-[#f06232]" aria-hidden />
                <span>Repeat buys from what you approved, with distributor-style case handling.</span>
              </li>
              <li className="flex gap-2">
                <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-[#f06232]" aria-hidden />
                <span>Net terms and fulfillment stay in the real world—phones and reps, not a black box.</span>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#1a1a1a] p-8">
            <h3 className="mb-4 text-lg font-bold text-white">Start from where you already buy</h3>
            <div className="flex flex-col gap-3">
              <Link
                href="/#bulk-order"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#f06232]/60 bg-[#f06232]/10 px-5 py-2.5 text-sm font-semibold text-[#f06232] transition hover:bg-[#f06232]/15"
              >
                Build a bulk request
              </Link>
              <Link
                href="/request-pricing"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/20 bg-transparent px-5 py-2.5 text-sm font-semibold text-white transition hover:border-[#f06232]/50 hover:text-[#f06232]"
              >
                Request pricing
              </Link>
              <Link
                href="/store"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-5 py-2.5 text-sm font-medium text-white/80 transition hover:text-[#f06232]"
              >
                Browse gloves
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeHumanAdvisorSection() {
  return (
    <section className={`${sectionShell} bg-[#161616]`} aria-labelledby="advisor-heading">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#1a1a1a] px-6 py-10 text-center sm:px-10">
        <h2 id="advisor-heading" className="mb-3 text-xl font-extrabold text-white sm:text-2xl">
          Prefer to walk through it with someone?
        </h2>
        <p className="mb-8 text-base leading-relaxed text-white/75">
          Our team reads invoices and specs every day. If you are not sure what to upload or how to read the comparison,
          we will help you get to a clean quote without pressure.
        </p>
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap">
          <a
            href={SITE_PHONE_TEL_HREF}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#f06232] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#f06232]"
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            Call us
          </a>
          <a
            href={SITE_SALES_MAILTO_HREF}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-[#f06232]/50"
          >
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            Email sales
          </a>
          <Link
            href="/contact"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-[#f06232]/50"
          >
            <Headphones className="h-4 w-4 shrink-0" aria-hidden />
            Contact
          </Link>
        </div>
      </div>
    </section>
  );
}
