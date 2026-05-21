import { ArrowRight, BookOpen, FileText, GitCompare, Scale, ShieldCheck, Tag } from "lucide-react";
import { ProcurementSectionShell, SectionEyebrow } from "@/components/procurement";
import { HomeCtaLink } from "@/components/home/authority/HomeAuthorityPrimitives";
import { HomeSupplierNetworkComparison } from "@/components/home/HomeSupplierNetworkComparison";

const VALUE_CARDS = [
  {
    icon: Scale,
    title: "Compare before you commit",
    body: "See multiple options, specs, and pricing context before signing.",
  },
  {
    icon: GitCompare,
    title: "Source beyond one catalog",
    body: "Tap into broader supplier pathways—not just one shelf.",
  },
  {
    icon: BookOpen,
    title: "Keep glove specs visible",
    body: "Material, compliance, and use-case fit stay front and center.",
  },
] as const;

export function HomeWhyExistsSection() {
  return (
    <ProcurementSectionShell
      tone="light"
      borderTop={false}
      headingId="why-exists-heading"
      ariaLabel="Supplier network advantage"
      className="relative overflow-x-hidden !border-t-0 !bg-[#f4f4f2] !py-6 sm:!py-8"
      containerClassName="max-w-proc"
    >
      <div className="relative min-w-0 overflow-hidden rounded-2xl border border-[#ebebea] bg-gradient-to-br from-white via-[#fafaf8] to-[#f4f4f2] p-4 shadow-[0_12px_40px_rgb(0_0_0/0.05)] sm:rounded-[1.5rem] sm:p-5 lg:p-6">
        <div className="relative mb-5 min-w-0 lg:mb-6">
          <div className="mb-3 h-1 w-12 bg-[var(--color-accent-orange)]" aria-hidden />
          <SectionEyebrow tone="light" className="mb-3 justify-start text-[11px] tracking-[0.16em]">
            Supplier network advantage
          </SectionEyebrow>

          <h2
            id="why-exists-heading"
            className="mb-3 max-w-4xl text-[1.65rem] font-black leading-[1.08] tracking-tight text-[#0a0a0a] sm:text-[1.85rem] lg:text-[2rem]"
          >
            Stop signing contracts. Your supplier is controlling your business
            <span className="text-[var(--color-accent-orange)]">.</span>
          </h2>

          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-text-muted-light sm:text-[15px]">
            Compare glove options across supplier networks, quote requests, and invoice context—without
            being locked to one catalog or reorder habit.
          </p>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <HomeCtaLink
              href="/request-pricing"
              icon={Tag}
              className="min-h-[46px] px-6 text-sm shadow-[0_6px_24px_rgb(255_106_0/0.3)]"
            >
              Request pricing
            </HomeCtaLink>
            <HomeCtaLink
              href="/invoice-savings"
              variant="secondary"
              icon={FileText}
              className="min-h-[46px] border-[#d0d0cc] px-6 text-sm shadow-[0_2px_10px_rgb(0_0_0/0.04)]"
            >
              Upload invoice
            </HomeCtaLink>
            <p className="m-0 flex w-full items-center gap-2 rounded-lg border border-[#ebebea] bg-[#fafaf8] px-3 py-2 text-xs text-neutral-600 sm:ml-1 sm:w-auto sm:text-sm">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--color-accent-orange)]" aria-hidden />
              <span>No commitments. No lock-ins.</span>
            </p>
          </div>
        </div>

        <HomeSupplierNetworkComparison className="mb-5 min-w-0 sm:mb-6" />

        <ul className="relative m-0 mt-5 grid min-w-0 grid-cols-1 gap-2.5 p-0 sm:mt-6 sm:grid-cols-3 sm:gap-3">
          {VALUE_CARDS.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="group list-none overflow-hidden rounded-xl border border-[#ebebea] bg-white shadow-[0_2px_12px_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_6px_20px_rgb(0_0_0/0.06)]"
            >
              <div className="flex gap-3 p-3 sm:p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fff4ec]">
                  <Icon className="h-4 w-4 text-[var(--color-accent-orange)]" strokeWidth={2} aria-hidden />
                </div>
                <div className="flex min-w-0 flex-1 flex-col pr-0.5">
                  <h3 className="mb-1 text-sm font-bold leading-snug tracking-tight text-ink">{title}</h3>
                  <p className="m-0 text-xs leading-relaxed text-text-muted-light">{body}</p>
                  <ArrowRight
                    className="mt-2 h-3.5 w-3.5 self-end text-[var(--color-accent-orange)]/55 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent-orange)]"
                    aria-hidden
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </ProcurementSectionShell>
  );
}
