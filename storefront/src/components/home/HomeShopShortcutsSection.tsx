import Link from "next/link";
import { ArrowRight, Layers, Shield, SprayCan, UtensilsCrossed } from "lucide-react";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";

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
    <section
      className="border-t border-white/10 bg-[#101010] px-4 py-14 sm:px-6 sm:py-16 lg:px-8"
      aria-labelledby="shop-shortcuts-heading"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#f06232]">Catalog entry points</p>
          <h2 id="shop-shortcuts-heading" className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Start from how you buy
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/65 sm:text-[15px]">
            Jump straight into live listings—specs, pack context, and list pricing when published. Everything else routes through
            quote review without slowing down picks.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SHORTCUTS.map(({ title, body, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex h-full flex-col rounded-xl border border-white/10 bg-[#161616] p-5 shadow-sm transition hover:border-[#f06232]/45 hover:bg-[#1a1a1a]"
            >
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-[#f06232]/25 bg-[#f06232]/[0.08] text-[#f06232]">
                <Icon className="h-5 w-5" aria-hidden strokeWidth={2} />
              </span>
              <h3 className="text-[15px] font-bold text-white">{title}</h3>
              <p className="mt-2 flex-1 text-[12px] leading-snug text-white/55">{body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-[#f06232]">
                Shop this path
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
