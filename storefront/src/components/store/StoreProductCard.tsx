"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoreProductRow } from "@/lib/catalog/store-products";
import { AddToQuoteButton } from "@/components/quote/AddToQuoteButton";
import { StoreBadgeStack } from "@/components/store/StoreBadgeStack";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function StoreProductCard({ product }: { product: StoreProductRow }) {
  const specLine = [product.materialHint, product.sizeCode].filter(Boolean).join(" · ");
  const certScan = [product.protectionHint, ...(product.certificationHints ?? [])].filter(Boolean).slice(0, 2).join(" · ");
  const priceLine =
    product.bestPrice != null ? (
      <div className="text-[12px] font-semibold tabular-nums text-emerald-400/95">From {usd.format(product.bestPrice)}</div>
    ) : (
      <div className="text-[11px] font-medium text-white/45">Request pricing</div>
    );

  const pdpHref = `/store/p/${encodeURIComponent(product.slug)}`;

  return (
    <Card className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141414] shadow-sm transition-shadow hover:border-[#FF7A00]/35 hover:shadow-md">
      <div className="relative shrink-0">
        <div className="relative aspect-square w-full bg-black/40">
          <StoreBadgeStack labels={product.badges} />
          <Link href={pdpHref} className="block h-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={`${product.name} — product image`}
                className="h-full w-full object-contain p-2"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] text-white/35">No image</div>
            )}
          </Link>
        </div>
      </div>
      <CardHeader className="space-y-1 px-3 pb-1.5 pt-2.5">
        {product.brandName ? (
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#FF7A00]/90">{product.brandName}</div>
        ) : null}
        <CardTitle className="line-clamp-2 text-left text-[13px] font-bold leading-snug text-white">
          <Link href={pdpHref} className="hover:text-[#ffb27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
            {product.name}
          </Link>
        </CardTitle>
        {product.commercialUseSummary ? (
          <p className="line-clamp-2 text-[10px] font-medium leading-snug text-[#ffb27a]/90">{product.commercialUseSummary}</p>
        ) : null}
        {certScan ? <p className="line-clamp-1 text-[10px] text-white/50">{certScan}</p> : null}
        <div className="space-y-0.5 text-[11px] text-white/55">
          {product.variantSku ? <div>SKU: {product.variantSku}</div> : null}
          {product.internalSku && product.internalSku !== product.variantSku ? (
            <div>Parent: {product.internalSku}</div>
          ) : null}
          {specLine ? <div className="text-white/70">{specLine}</div> : null}
        </div>
        {priceLine}
      </CardHeader>
      <CardContent className="mt-auto px-3 pb-3 pt-0">
        <AddToQuoteButton product={product} />
      </CardContent>
    </Card>
  );
}
