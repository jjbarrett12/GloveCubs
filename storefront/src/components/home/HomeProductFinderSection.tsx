import Link from "next/link";
import { ArrowRight, Hand, HardHat, Shield, FileText } from "lucide-react";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import { SectionEyebrow } from "@/components/procurement";
import { cn } from "@/lib/utils";

const SPEC_CARD =
  "group flex h-full flex-col rounded-xl border border-border-light bg-white p-5 shadow-proc-light-sm transition hover:border-brand/40 hover:shadow-proc-light-md";

const ICON_BOX = "mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-brand/25 bg-brand/[0.08] text-brand";

type HomeProductFinderSectionProps = {
  embedded?: boolean;
  /** Omit section heading when parent shell provides it (§4 intelligence). */
  hideHeading?: boolean;
};

export function HomeProductFinderSection({ embedded = false, hideHeading = false }: HomeProductFinderSectionProps) {
  const content = (
  <>
      {!embedded && !hideHeading ? (
        <>
          <SectionEyebrow tone="light">Catalog depth</SectionEyebrow>
          <div className="mb-8">
            <h2 id="finder-heading" className="proc-h2-light mb-3">
              Spec shopping—without retail noise
            </h2>
            <p className="proc-body-light max-w-3xl">
              Every listing carries the attributes we have on file—mil, texture, use-case tags, and certs where published. Need a
              match from what you already run? Use invoice review or request pricing.
            </p>
          </div>
        </>
      ) : embedded && !hideHeading ? (
        <div className="mb-8">
          <h3 id="finder-heading" className="proc-h3-light mb-2">
            Spec shopping—without retail noise
          </h3>
          <p className="proc-body-light max-w-3xl">
            Attributes on file—mil, texture, use-case tags, and certs where published. Match from invoice review or request pricing.
          </p>
        </div>
      ) : null}

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link href="/store" className={SPEC_CARD}>
          <span className={ICON_BOX}>
            <Hand className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <h3 className="text-lg font-bold text-ink">Disposable Gloves</h3>
          <p className="mt-1 text-sm text-text-muted-light">Medical · Food Service · Industrial</p>
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border-light pt-4 text-sm text-text-muted-light">
            <div>
              <strong className="text-xs uppercase text-ink">Materials</strong>
              <p className="mt-1">Nitrile (4–8 mil), latex, vinyl</p>
            </div>
            <div>
              <strong className="text-xs uppercase text-ink">On each PDP</strong>
              <p className="mt-1">Attributes, pack context, quote when needed</p>
            </div>
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
            Browse disposables
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </Link>
        <Link href={buildStoreCatalogHref({ category: "work-gloves" })} className={SPEC_CARD}>
          <span className={ICON_BOX}>
            <HardHat className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <h3 className="text-lg font-bold text-ink">Reusable Work Gloves</h3>
          <p className="mt-1 text-sm text-text-muted-light">Cut-Resistant · Impact · Chemical</p>
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border-light pt-4 text-sm text-text-muted-light">
            <div>
              <strong className="text-xs uppercase text-ink">ANSI levels</strong>
              <p className="mt-1">A2–A5 cut, impact, chemical</p>
            </div>
            <div>
              <strong className="text-xs uppercase text-ink">Materials</strong>
              <p className="mt-1">HPPE/nitrile, leather, coated work</p>
            </div>
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
            Browse work gloves
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { href: buildStoreCatalogHref({ q: "nitrile" }), label: "Nitrile", sub: "4–8 mil thickness", icon: Shield },
          { href: buildStoreCatalogHref({ q: "latex powder-free" }), label: "Latex", sub: "Powder-free available", icon: Hand },
          { href: buildStoreCatalogHref({ q: "vinyl" }), label: "Vinyl", sub: "Economy option", icon: Hand },
          { href: "/invoice-savings", label: "Compare from invoice", sub: "Match to catalog options", icon: FileText },
        ].map(({ href, label, sub, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center rounded-xl border border-border-light bg-canvas-alt p-5 text-center shadow-proc-light-sm transition hover:border-brand/40"
          >
            <Icon className="mb-2 h-8 w-8 text-brand" strokeWidth={2} aria-hidden />
            <strong className="text-sm font-bold text-ink">{label}</strong>
            <span className="mt-1 text-xs text-text-muted-light">{sub}</span>
          </Link>
        ))}
      </div>

      {!embedded ? (
        <div className="mt-8 flex flex-col items-center gap-3 border-t border-border-light pt-8 sm:flex-row sm:flex-wrap sm:justify-center">
          <Link
            href="/store"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-hover"
          >
            Browse full store
          </Link>
          <Link
            href="/request-pricing"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border-light bg-canvas px-6 py-3 text-sm font-bold text-brand hover:border-brand/50"
          >
            Request pricing
          </Link>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className={cn("scroll-mt-28")}>{content}</div>;
  }

  return (
    <section className="scroll-mt-28 border-t border-border-light bg-white px-4 py-proc-section-y sm:px-6 lg:px-8" aria-labelledby="finder-heading">
      <div className="mx-auto max-w-proc">{content}</div>
    </section>
  );
}
