import Link from "next/link";
import { ArrowRight, Layers, Shield, SprayCan, UtensilsCrossed } from "lucide-react";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import { ProcurementSectionShell, SectionEyebrow } from "@/components/procurement";

const SHORTCUTS: { title: string; body: string; href: string; icon: typeof Layers }[] = [
  {
    title: "Nitrile disposables",
    body: "Exam and general-duty nitrile—filter by mil, texture, and cert-ready attributes on the listing.",
    href: buildStoreCatalogHref({ q: "nitrile disposable" }),
    icon: Shield,
  },
  {
    title: "Food service programs",
    body: "Vinyl and nitrile paths common in kitchens and prep—case-focused buying.",
    href: buildStoreCatalogHref({ industries: ["food_processing"] }),
    icon: UtensilsCrossed,
  },
  {
    title: "Industrial work gloves",
    body: "Cut, chemical, and general mechanical gloves when tasks go beyond disposables.",
    href: buildStoreCatalogHref({ category: "work-gloves" }),
    icon: Layers,
  },
  {
    title: "Janitorial & sanitation",
    body: "High-turnover disposables and facility-use SKUs in one filtered view.",
    href: "/industries/janitorial",
    icon: SprayCan,
  },
];

export function HomeShopShortcutsSection() {
  return (
    <ProcurementSectionShell tone="raised" headingId="shop-shortcuts-heading" className="py-14 sm:py-16">
      <SectionEyebrow>Catalog entry points</SectionEyebrow>
      <div className="mb-8 max-w-2xl">
        <h2 id="shop-shortcuts-heading" className="proc-h2 mt-1">
          Start from how you buy
        </h2>
        <p className="proc-body mt-2 text-sm sm:text-[15px]">
          Jump straight into live listings—specs, pack context, and list pricing when published. Everything else routes through quote
          review without slowing down picks.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map(({ title, body, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex h-full flex-col rounded-xl border border-border-subtle bg-surface-card p-5 shadow-proc-sm transition hover:border-brand/45 hover:bg-surface-card-alt"
          >
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-brand/25 bg-brand/[0.08] text-brand">
              <Icon className="h-5 w-5" aria-hidden strokeWidth={2} />
            </span>
            <h3 className="text-[15px] font-bold text-white">{title}</h3>
            <p className="mt-2 flex-1 text-[12px] leading-snug text-text-muted">{body}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-brand">
              Shop this path
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </ProcurementSectionShell>
  );
}
