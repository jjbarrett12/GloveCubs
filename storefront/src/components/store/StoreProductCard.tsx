"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoreProductRow } from "@/lib/catalog/store-products";
import { AddToQuoteButton } from "@/components/quote/AddToQuoteButton";
import { StoreBadgeStack } from "@/components/store/StoreBadgeStack";
import { ProductImage } from "@/components/store/ProductImage";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function StoreProductCard({ product }: { product: StoreProductRow }) {
  const specLine = [product.materialHint, product.sizeCode].filter(Boolean).join(" · ");
  const certScan = [product.protectionHint, ...(product.certificationHints ?? [])].filter(Boolean).slice(0, 2).join(" · ");
  const priceLine =
    product.bestPrice != null ? (
      <div className="text-[12px] font-semibold tabular-nums text-sales">From {usd.format(product.bestPrice)}</div>
    ) : (
      <div className="text-[11px] font-medium text-white/45">Request pricing</div>
    );

  const pdpHref = `/store/p/${encodeURIComponent(product.slug)}`;

  return (
    <Card className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141414] shadow-md transition-shadow hover:border-[#f06232]/35 hover:shadow-lg">
      <div className="relative shrink-0">
        <div className="relative aspect-square w-full bg-black/40">
          <StoreBadgeStack labels={product.badges} />
          <Link href={pdpHref} className="block h-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#f06232]">
            <ProductImage
              src={product.imageUrl}
              alt={`${product.name} — product image`}
              containerClassName="rounded-none border-0 bg-transparent"
            />
          </Link>
        </div>
      </div>
      <CardHeader className="space-y-1 px-3 pb-1.5 pt-2.5">
        {product.brandName ? (
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#f06232]/90">{product.brandName}</div>
        ) : null}
        <CardTitle className="line-clamp-2 text-left text-[13px] font-bold leading-snug text-white">
          <Link href={pdpHref} className="hover:text-[#f06232] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f06232]">
            {product.name}
          </Link>
        </CardTitle>
        {product.commercialUseSummary ? (
          <p className="line-clamp-2 text-[10px] font-medium leading-snug text-[#f06232]/90">{product.commercialUseSummary}</p>
        ) : null}
        {certScan ? <p className="line-clamp-1 text-[10px] text-white/50">{certScan}</p> : null}
        <div className="space-y-0.5 text-[11px] text-white/55">
          {product.variantSku ? (
            <div>
              <span className="text-white/40">Order SKU</span>{" "}
              <span className="font-mono text-white/80">{product.variantSku}</span>
            </div>
          ) : null}
          {product.internalSku && product.internalSku !== product.variantSku ? (
            <div className="text-[10px] text-white/45">
              Style ref <span className="font-mono text-white/55">{product.internalSku}</span>
            </div>
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
