import Link from "next/link";
import { Bot, FileSearch, RefreshCw, Shield, Sparkles } from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import { HomeCtaLink, HomeSectionIntro } from "@/components/home/authority/HomeAuthorityPrimitives";

const CAPABILITIES = [
  {
    icon: FileSearch,
    title: "Invoice analysis",
    body: "Extract lines from distributor invoices and map to catalog variants—governed alternates when they apply.",
  },
  {
    icon: Sparkles,
    title: "AI-assisted sourcing",
    body: "Guided finder connects task, materials, and constraints to quote-ready SKUs—not random substitutes.",
  },
  {
    icon: RefreshCw,
    title: "Substitution intelligence",
    body: "Honest pack-size alignment when we suggest a swap—fewer vetted paths beat unreviewed lookalikes.",
  },
  {
    icon: Shield,
    title: "Supply continuity",
    body: "Variant clarity for recurring programs—humans on quotes when automation reaches its limit.",
  },
] as const;

export function HomeAiProcurementSection() {
  return (
    <ProcurementSectionShell
      tone="card"
      headingId="ai-procurement-heading"
      ariaLabel="AI procurement intelligence"
      className="border-t border-[var(--color-border-muted)] !py-16 sm:!py-20"
    >
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <HomeSectionIntro
          headingId="ai-procurement-heading"
          eyebrow="Procurement intelligence"
          eyebrowIcon={Bot}
          title="Quietly powerful sourcing"
          description="Real workflows—invoice matching, guided selection, governed alternates. No invented dashboards or analytics theater."
          tone="dark"
          className="mb-0 lg:mb-0"
        />
        <HomeCtaLink href="/invoice-savings" variant="primary" className="shrink-0">
          Upload invoice
        </HomeCtaLink>
      </div>

      <ul className="mt-12 divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-[var(--color-border-muted)]">
        {CAPABILITIES.map(({ icon: Icon, title, body }, i) => (
          <li
            key={title}
            className="grid grid-cols-1 gap-4 bg-[#141414] p-6 transition hover:bg-[#161616] sm:grid-cols-[auto_1fr] sm:gap-6 sm:p-8"
          >
            <div className="flex items-start gap-4 sm:flex-col sm:items-center sm:gap-0">
              <span className="font-mono text-sm text-white/25">{String(i + 1).padStart(2, "0")}</span>
              <Icon className="h-7 w-7 text-[var(--color-accent-orange)]" strokeWidth={1.5} aria-hidden />
            </div>
            <div>
              <h3 className="mb-2 text-lg font-bold text-white">{title}</h3>
              <p className="m-0 max-w-xl text-sm leading-relaxed text-white/62">{body}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center text-xs leading-relaxed text-white/38">
        Scope varies by account and SKU coverage—upload an invoice or request pricing to see what applies.
      </p>
    </ProcurementSectionShell>
  );
}
