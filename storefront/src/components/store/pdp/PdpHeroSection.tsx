"use client";

import * as React from "react";
import Link from "next/link";
import { Download, GitCompare, MessageCircle } from "lucide-react";
import type { StoreProductDetail } from "@/lib/catalog/store-product-detail";
import type { PdpEducationModel } from "@/lib/catalog/pdp-education";
import { ProductImage } from "@/components/store/ProductImage";
import { PdpVariantPricePanel } from "@/components/store/pdp/PdpVariantPricePanel";
import type { PdpSelectedVariantPricingDisplay } from "@/lib/pricing/pdp-variant-pricing-display";
import { cn } from "@/lib/utils";

const COMPARE_STORAGE_KEY = "gc-pdp-compare-slugs";

type Props = {
  detail: StoreProductDetail;
  education: PdpEducationModel;
  selectedVariantSku: string | null;
  selectedVariantSize: string | null;
  parentFrom: ReturnType<typeof import("@/lib/pricing/pdp-variant-pricing-display").resolvePdpParentFromDisplay>;
  selectedPricing: PdpSelectedVariantPricingDisplay;
  quoteCta: React.ReactNode;
  requestPricingCta: React.ReactNode;
};

export function PdpHeroSection({
  detail,
  education,
  selectedVariantSku,
  selectedVariantSize,
  parentFrom,
  selectedPricing,
  quoteCta,
  requestPricingCta,
}: Props) {
  const [activeImage, setActiveImage] = React.useState(0);
  const gallery = detail.gallery;
  const heroUrl = gallery[activeImage]?.url ?? gallery[0]?.url ?? null;

  const badges = detail.commercialRows.slice(0, 6);

  const onCompare = () => {
    try {
      const raw = sessionStorage.getItem(COMPARE_STORAGE_KEY);
      const slugs: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      if (!slugs.includes(detail.slug)) slugs.push(detail.slug);
      sessionStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(slugs.slice(-4)));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-[0_16px_48px_rgb(0_0_0/0.32)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.02)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.02)_1px,transparent_1px)] bg-[length:20px_20px]" />

      <div className="relative grid grid-cols-1 gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,260px)] xl:gap-8">
        <div className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
            <ProductImage
              src={heroUrl}
              alt={detail.name}
              loading="eager"
              className="aspect-square w-full object-contain"
            />
          </div>
          {gallery.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {gallery.map((img, i) => (
                <button
                  key={`${img.url}-${i}`}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    "h-14 w-14 shrink-0 overflow-hidden rounded-lg border transition",
                    activeImage === i ? "border-[var(--color-accent-orange)]" : "border-white/15 opacity-70 hover:opacity-100"
                  )}
                >
                  <ProductImage src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          {detail.brandName ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)]">{detail.brandName}</p>
          ) : null}
          <h1 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">{detail.name}</h1>
          <p className="text-sm font-semibold text-white/55">{education.classification}</p>
          <p className="max-w-2xl text-sm leading-relaxed text-white/65">{education.educationalSummary}</p>

          {badges.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <span
                  key={`${b.label}-${b.value}`}
                  className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-white/80"
                >
                  {b.label}: {b.value}
                </span>
              ))}
            </div>
          ) : null}

          {selectedVariantSku ? (
            <dl className="grid max-w-md gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] sm:grid-cols-[auto_1fr]">
              <dt className="text-white/40">SKU</dt>
              <dd className="font-mono font-medium text-white/90">{selectedVariantSku}</dd>
              {selectedVariantSize ? (
                <>
                  <dt className="text-white/40">Size</dt>
                  <dd className="font-mono text-white/80">{selectedVariantSize}</dd>
                </>
              ) : null}
            </dl>
          ) : null}

          <PdpVariantPricePanel parentFrom={parentFrom} selectedPricing={selectedPricing} />
        </div>

        <aside className="flex min-w-0 flex-col gap-2 xl:sticky xl:top-24 xl:self-start">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/45">Procurement actions</p>
          {quoteCta}
          {requestPricingCta}
          <Link
            href="/glove-finder"
            onClick={onCompare}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/[0.06]"
          >
            <GitCompare className="h-4 w-4" aria-hidden />
            Compare in glove finder
          </Link>
          {education.primaryDownload ? (
            <a
              href={education.primaryDownload.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/[0.06]"
            >
              <Download className="h-4 w-4" aria-hidden />
              {education.primaryDownload.label}
            </a>
          ) : null}
          <Link
            href="/request-pricing"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--color-accent-orange)]/40 px-4 text-sm font-semibold text-[var(--color-accent-orange)] transition hover:bg-[var(--color-accent-orange)]/10"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Talk to specialist
          </Link>
        </aside>
      </div>
    </div>
  );
}
