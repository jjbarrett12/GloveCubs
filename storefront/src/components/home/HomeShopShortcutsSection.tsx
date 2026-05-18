import Link from "next/link";
import { ArrowRight, Layers, Shield, SprayCan, UtensilsCrossed } from "lucide-react";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import { SectionEyebrow } from "@/components/procurement";

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

type HomeShopShortcutsSectionProps = {
  embedded?: boolean;
};

export function HomeShopShortcutsSection({ embedded = false }: HomeShopShortcutsSectionProps) {
  const grid = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {SHORTCUTS.map(({ title, body, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group flex h-full flex-col items-center rounded-xl border border-border-light bg-white p-5 text-center shadow-proc-light-sm transition hover:border-brand/40 hover:shadow-proc-light-md"
        >
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-brand/25 bg-brand/[0.08] text-brand">
            <Icon className="h-5 w-5" aria-hidden strokeWidth={2} />
          </span>
          <h3 className="text-[15px] font-bold text-ink">{title}</h3>
          <p className="mt-2 flex-1 text-[12px] leading-snug text-text-muted-light">{body}</p>
          <span className="mt-4 inline-flex items-center justify-center gap-1 text-[12px] font-semibold text-brand">
            Shop this path
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div className="mb-12">
        <SectionEyebrow tone="light">Catalog entry points</SectionEyebrow>
        <h3 className="proc-h3-light mb-2">Start from how you buy</h3>
        <p className="proc-body-light mb-6 max-w-2xl text-sm">
          Jump into live listings—specs, pack context, and list pricing when published.
        </p>
        {grid}
      </div>
    );
  }

  return (
    <section className="border-t border-border-light bg-canvas-alt px-4 py-14 sm:px-6 sm:py-16 lg:px-8" aria-labelledby="shop-shortcuts-heading">
      <div className="mx-auto max-w-proc">
        <SectionEyebrow tone="light">Catalog entry points</SectionEyebrow>
        <h2 id="shop-shortcuts-heading" className="proc-h2-light mt-1">
          Start from how you buy
        </h2>
        <p className="proc-body-light mt-2 mb-8 max-w-2xl">
          Jump straight into live listings—specs, pack context, and list pricing when published.
        </p>
        {grid}
      </div>
    </section>
  );
}
