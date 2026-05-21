"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { StoreProductDetail } from "@/lib/catalog/store-product-detail";
import { buildStoreProductRowForVariant } from "@/lib/catalog/store-product-detail";
import { buildPdpEducationModel } from "@/lib/catalog/pdp-education";
import { canAddProductRowToQuote } from "@/lib/catalog/store-quote-rules";
import { AddToQuoteButton } from "@/components/quote/AddToQuoteButton";
import { StoreProductCard } from "@/components/store/StoreProductCard";
import { StorePageShell } from "@/components/store/StorePageShell";
import { PdpStickyMobileCta } from "@/components/store/pdp/PdpStickyMobileCta";
import { PdpVariantMatrix } from "@/components/store/pdp/PdpVariantMatrix";
import { PdpHeroSection } from "@/components/store/pdp/PdpHeroSection";
import { PdpEducationSection } from "@/components/store/pdp/education/PdpEducationSection";
import {
  resolvePdpParentFromDisplay,
  resolvePdpSelectedVariantPricingDisplay,
} from "@/lib/pricing/pdp-variant-pricing-display";

export function StorePdpContent({ detail }: { detail: StoreProductDetail }) {
  const initialVariantId = detail.defaultVariant?.id ?? detail.variants[0]?.id ?? null;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(initialVariantId);

  const education = useMemo(() => buildPdpEducationModel(detail), [detail]);

  const selectedVariant = useMemo(
    () => detail.variants.find((v) => v.id === selectedVariantId) ?? detail.defaultVariant ?? detail.variants[0] ?? null,
    [detail.defaultVariant, detail.variants, selectedVariantId]
  );

  const quoteBase = detail.quoteProductRow;
  const selectedQuoteProduct =
    quoteBase && selectedVariant ? buildStoreProductRowForVariant(quoteBase, selectedVariant) : quoteBase;

  const parentFrom = useMemo(
    () => resolvePdpParentFromDisplay(detail.bestPrice, detail.bestPriceScope),
    [detail.bestPrice, detail.bestPriceScope]
  );

  const selectedPricing = useMemo(
    () =>
      resolvePdpSelectedVariantPricingDisplay(
        selectedVariant?.id ?? null,
        detail.variantPricing,
        detail.buyerUnitReferencesByVariantId
      ),
    [selectedVariant?.id, detail.variantPricing, detail.buyerUnitReferencesByVariantId]
  );

  const showQuoteCta =
    selectedQuoteProduct != null && canAddProductRowToQuote(selectedQuoteProduct);

  const quoteCta =
    showQuoteCta && selectedQuoteProduct ? (
      <AddToQuoteButton product={selectedQuoteProduct} className="h-11 w-full text-sm font-bold" />
    ) : (
      <ButtonRequestPricingLink className="h-11 w-full" />
    );

  const requestPricingCta = showQuoteCta ? <ButtonRequestPricingLink className="h-10 w-full" /> : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-28 font-poppins md:pb-10">
      <header className="border-b border-white/10">
        <StorePageShell>
          <div className="flex items-center justify-between gap-4 py-4">
            <Link href="/" className="text-xl font-semibold text-white">
              GloveCubs
            </Link>
            <nav className="flex flex-wrap items-center justify-end gap-3 text-sm">
              <Link href="/store" className="text-white/80 hover:text-white">
                Store
              </Link>
              <Link href="/quote-cart" className="text-white/80 hover:text-white">
                Quote request cart
              </Link>
            </nav>
          </div>
        </StorePageShell>
      </header>

      <main className="py-6 sm:py-8">
        <StorePageShell>
          <nav className="mb-4 text-[11px] text-white/45">
            <Link href="/store" className="text-[var(--color-accent-orange)]/90 hover:underline">
              Store
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/70">{detail.name}</span>
          </nav>

          <div className="space-y-8">
            <PdpHeroSection
              detail={detail}
              education={education}
              selectedVariantSku={selectedVariant?.variant_sku ?? null}
              selectedVariantSize={selectedVariant?.size_code ?? null}
              parentFrom={parentFrom}
              selectedPricing={selectedPricing}
              quoteCta={quoteCta}
              requestPricingCta={requestPricingCta}
            />

            {detail.variants.length > 0 ? (
              <PdpVariantMatrix
                variants={detail.variants}
                variantPricing={detail.variantPricing}
                selectedVariantId={selectedVariant?.id ?? null}
                onSelectVariant={setSelectedVariantId}
              />
            ) : null}

            <PdpEducationSection model={education} specRows={detail.specRows} />

            {detail.specRows.length > 0 ? (
              <section className="rounded-xl border border-white/10 bg-[#141414]">
                <div className="border-b border-white/10 px-4 py-3">
                  <h2 className="text-[12px] font-bold uppercase tracking-wide text-white/80">Full specifications</h2>
                  <p className="mt-0.5 text-[11px] text-white/45">Published attribute values for this SKU</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] text-white/75">
                    <tbody>
                      {detail.specRows.map((row, idx) => (
                        <tr key={`${row.attribute_key}-${row.label}-${idx}`} className="border-b border-white/[0.06] last:border-0">
                          <th className="w-[40%] px-4 py-2 align-top font-medium text-white/50">{row.label}</th>
                          <td className="px-4 py-2 text-white/85">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {detail.downloads.length > 0 ? (
              <section className="rounded-xl border border-white/10 bg-[#141414]">
                <div className="border-b border-white/10 px-4 py-3">
                  <h2 className="text-[12px] font-bold uppercase tracking-wide text-white/80">Downloads</h2>
                </div>
                <ul className="list-none space-y-2 p-4 text-[12px]">
                  {detail.downloads.map((d) => (
                    <li key={d.url}>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[var(--color-accent-orange)] hover:underline"
                      >
                        {d.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {detail.related.length > 0 ? (
              <section>
                <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-white/80">Related products</h2>
                <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
                  {detail.related.map((p) => (
                    <li key={p.id} className="min-w-0">
                      <StoreProductCard product={p} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </StorePageShell>
      </main>

      <PdpStickyMobileCta product={selectedQuoteProduct} showRequestPricingPrimary={!showQuoteCta} />
    </div>
  );
}

function ButtonRequestPricingLink({ className }: { className?: string }) {
  return (
    <Link
      href="/request-pricing"
      className={`inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-accent-orange)]/50 px-4 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-orange)]/10 ${className ?? ""}`}
    >
      Request pricing
    </Link>
  );
}
