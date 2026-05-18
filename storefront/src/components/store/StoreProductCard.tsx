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
import { cn } from "@/lib/utils";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export type StoreProductCardSurface = "dark" | "light";

function ProcurementSpecStrip({
  product,
  surface,
}: {
  product: StoreProductRow;
  surface: StoreProductCardSurface;
}) {
  const specParts = [product.materialHint, product.sizeCode].filter(Boolean);
  const certParts = [product.protectionHint, ...(product.certificationHints ?? [])].filter(Boolean).slice(0, 2);
  const multi = productRequiresSizeSelection(product);
  const isLight = surface === "light";

  return (
    <div className={cn("space-y-1.5 border-t pt-2", isLight ? "border-border-light" : "border-white/[0.06]")}>
      {product.commercialUseSummary ? (
        <p
          className={cn(
            "line-clamp-2 text-[10px] font-medium leading-snug",
            isLight ? "text-text-muted-light" : "text-white/60"
          )}
        >
          {product.commercialUseSummary}
        </p>
      ) : null}
      {specParts.length > 0 ? (
        <p className={cn("text-[10px] font-medium", isLight ? "text-neutral-700" : "text-white/70")}>
          <span className={isLight ? "text-neutral-400" : "text-white/40"}>Spec · </span>
          {specParts.join(" · ")}
        </p>
      ) : null}
      {certParts.length > 0 ? (
        <p className={cn("line-clamp-1 text-[10px]", isLight ? "text-neutral-500" : "text-white/50")}>
          {certParts.join(" · ")}
        </p>
      ) : null}
      {multi ? (
        <p className="text-[10px] font-semibold text-brand">
          {product.activeVariantCount} sizes · select on detail
        </p>
      ) : product.variantSku ? (
        <p className={cn("font-mono text-[10px]", isLight ? "text-neutral-500" : "text-white/55")}>
          <span className={isLight ? "text-neutral-400" : "text-white/40"}>SKU · </span>
          {product.variantSku}
        </p>
      ) : null}
      {!multi && product.internalSku && product.internalSku !== product.variantSku ? (
        <p className={cn("font-mono text-[10px]", isLight ? "text-neutral-400" : "text-white/40")}>
          Parent {product.internalSku}
        </p>
      ) : null}
    </div>
  );
}

export function StoreProductCard({
  product,
  surface = "dark",
}: {
  product: StoreProductRow;
  surface?: StoreProductCardSurface;
}) {
  const isLight = surface === "light";

  const priceLine =
    product.bestPrice != null ? (
      <div className="text-[13px] font-bold tabular-nums text-sales">From {usd.format(product.bestPrice)}</div>
    ) : (
      <div className={cn("text-[11px] font-medium", isLight ? "text-neutral-500" : "text-white/45")}>Request pricing</div>
    );

  const pdpHref = `/store/p/${encodeURIComponent(product.slug)}`;
  const selectSizeHref = storeProductPdpVariantsAnchor(product.slug);
  const showQuote = canAddProductRowToQuote(product);
  const needsSize = productRequiresSizeSelection(product);

  return (
    <Card
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-xl border shadow-proc-light-sm transition-[border-color,box-shadow] hover:shadow-proc-light-md",
        isLight
          ? "border-border-light bg-canvas hover:border-brand/35"
          : "border-white/10 bg-[#121212] shadow-sm hover:border-[#f06232]/35 hover:shadow-md"
      )}
    >
      <div className="relative shrink-0">
        <div
          className={cn(
            "relative aspect-[4/3] w-full sm:aspect-square",
            isLight ? "bg-neutral-100" : "bg-black/40"
          )}
        >
          <StoreBadgeStack labels={product.badges} />
          <Link
            href={pdpHref}
            className={cn(
              "block h-full outline-none focus-visible:ring-2 focus-visible:ring-brand",
              isLight ? "ring-offset-2 ring-offset-white" : "ring-offset-2 ring-offset-[#121212]"
            )}
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
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand">{product.brandName}</div>
        ) : null}
        <CardTitle
          className={cn(
            "line-clamp-2 text-left text-[14px] font-bold leading-snug",
            isLight ? "text-ink" : "text-white"
          )}
        >
          <Link
            href={pdpHref}
            className={cn(
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              isLight ? "hover:text-brand" : "hover:text-[#ffb27a]"
            )}
          >
            {product.name}
          </Link>
        </CardTitle>
        <ProcurementSpecStrip product={product} surface={surface} />
        <div className="pt-0.5">{priceLine}</div>
      </CardHeader>

      <CardContent className="mt-auto flex flex-col gap-2 px-3 pb-3 pt-0">
        {needsSize ? (
          <Button asChild className="h-11 w-full bg-brand text-sm font-bold text-white hover:bg-brand-hover">
            <Link href={selectSizeHref}>Select size</Link>
          </Button>
        ) : showQuote ? (
          <AddToQuoteButton product={product} className="h-11 text-sm font-bold" />
        ) : (
          <Button
            asChild
            variant="outline"
            className="h-11 w-full border-brand/45 text-sm font-semibold text-brand hover:bg-brand/10"
          >
            <Link href="/request-pricing">Request pricing</Link>
          </Button>
        )}
        <Link
          href={pdpHref}
          className={cn(
            "text-center text-[11px] font-semibold transition-colors hover:text-brand hover:underline",
            isLight ? "text-neutral-500" : "text-white/55"
          )}
        >
          View details
        </Link>
      </CardContent>
    </Card>
  );
}
