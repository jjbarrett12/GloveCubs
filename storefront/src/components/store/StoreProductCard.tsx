"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { StoreProductRow } from "@/lib/catalog/store-products";
import { AddToQuoteButton } from "@/components/quote/AddToQuoteButton";
import { StoreBadgeStack } from "@/components/store/StoreBadgeStack";
import { ProductImage } from "@/components/store/ProductImage";
import {
  canAddProductRowToQuote,
  productRequiresSizeSelection,
  storeProductPdpVariantsAnchor,
} from "@/lib/catalog/store-quote-rules";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function ProcurementSpecStrip({ product }: { product: StoreProductRow }) {
  const specParts = [product.materialHint, product.sizeCode].filter(Boolean);
  const certParts = [product.protectionHint, ...(product.certificationHints ?? [])].filter(Boolean).slice(0, 2);
  const multi = productRequiresSizeSelection(product);

  return (
    <div className="space-y-1.5 border-t border-white/[0.06] pt-2">
      {product.commercialUseSummary ? (
        <p className="line-clamp-2 text-[10px] font-medium leading-snug text-white/60">{product.commercialUseSummary}</p>
      ) : null}
      {specParts.length > 0 ? (
        <p className="text-[10px] font-medium text-white/70">
          <span className="text-white/40">Spec · </span>
          {specParts.join(" · ")}
        </p>
      ) : null}
      {certParts.length > 0 ? (
        <p className="line-clamp-1 text-[10px] text-white/50">{certParts.join(" · ")}</p>
      ) : null}
      {multi ? (
        <p className="text-[10px] font-semibold text-[#f06232]/90">
          {product.activeVariantCount} sizes · select on detail
        </p>
      ) : product.variantSku ? (
        <p className="font-mono text-[10px] text-white/55">
          <span className="text-white/40">SKU · </span>
          {product.variantSku}
        </p>
      ) : null}
      {!multi && product.internalSku && product.internalSku !== product.variantSku ? (
        <p className="font-mono text-[10px] text-white/40">Parent {product.internalSku}</p>
      ) : null}
    </div>
  );
}

export function StoreProductCard({ product }: { product: StoreProductRow }) {
  const priceLine =
    product.bestPrice != null ? (
      <div className="text-[13px] font-bold tabular-nums text-sales">From {usd.format(product.bestPrice)}</div>
    ) : (
      <div className="text-[11px] font-medium text-white/45">Request pricing</div>
    );

  const pdpHref = `/store/p/${encodeURIComponent(product.slug)}`;
  const selectSizeHref = storeProductPdpVariantsAnchor(product.slug);
  const showQuote = canAddProductRowToQuote(product);
  const needsSize = productRequiresSizeSelection(product);

  return (
    <Card className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121212] shadow-sm transition-[border-color,box-shadow] hover:border-[#f06232]/35 hover:shadow-md">
      <div className="relative shrink-0">
        <div className="relative aspect-[4/3] w-full bg-black/40 sm:aspect-square">
          <StoreBadgeStack labels={product.badges} />
          <Link
            href={pdpHref}
            className="block h-full outline-none ring-offset-2 ring-offset-[#121212] focus-visible:ring-2 focus-visible:ring-[#f06232]"
          >
            <ProductImage
              src={product.imageUrl}
              alt={`${product.name} — product image`}
              containerClassName="rounded-none border-0 bg-transparent"
              className="p-3"
            />
          </Link>
        </div>
      </div>

      <CardHeader className="flex flex-1 flex-col gap-1.5 px-3 pb-2 pt-3">
        {product.brandName ? (
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#f06232]/90">{product.brandName}</div>
        ) : null}
        <CardTitle className="line-clamp-2 text-left text-[14px] font-bold leading-snug text-white">
          <Link
            href={pdpHref}
            className="transition-colors hover:text-[#ffb27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f06232]"
          >
            {product.name}
          </Link>
        </CardTitle>
        <ProcurementSpecStrip product={product} />
        <div className="pt-0.5">{priceLine}</div>
      </CardHeader>

      <CardContent className="mt-auto flex flex-col gap-2 px-3 pb-3 pt-0">
        {needsSize ? (
          <Button asChild className="h-11 w-full bg-[#f06232] text-sm font-bold text-white hover:bg-[#e5582d]">
            <Link href={selectSizeHref}>Select size</Link>
          </Button>
        ) : showQuote ? (
          <AddToQuoteButton product={product} className="h-11 text-sm font-bold" />
        ) : (
          <Button
            asChild
            variant="outline"
            className="h-11 w-full border-[#f06232]/45 text-sm font-semibold text-[#f06232] hover:bg-[#f06232]/10"
          >
            <Link href="/request-pricing">Request pricing</Link>
          </Button>
        )}
        <Link
          href={pdpHref}
          className="text-center text-[11px] font-semibold text-white/55 transition-colors hover:text-[#f06232] hover:underline"
        >
          View details
        </Link>
      </CardContent>
    </Card>
  );
}

