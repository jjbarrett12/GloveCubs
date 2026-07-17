"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  Hand,
  Layers,
  Shield,
  Sparkles,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
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
import { CommercePriceColumn } from "@/components/store/CommercePriceLine";
import { formatAttributeValueLabel } from "@/lib/catalog/attribute-value-labels";
import { cn } from "@/lib/utils";

export type StoreProductCardSurface = "dark" | "light";

type CardFeature = { icon: LucideIcon; label: string };

function packUnitHeading(unit: "case" | "pallet", label: string | null): string {
  if (!label) return unit.toUpperCase();
  const boxMatch = label.match(/(\d+)\s*box/i);
  if (unit === "case" && boxMatch) return `Case (${boxMatch[1]} boxes)`;
  const caseMatch = label.match(/(\d+)\s*cases/i);
  if (unit === "pallet" && caseMatch) return `Pallet (${caseMatch[1]} cases)`;
  return unit.toUpperCase();
}

function displayCertLabel(cert: string): string {
  return cert.includes("_") ? formatAttributeValueLabel("certifications", cert) : cert;
}

function deriveCardFeatures(product: StoreProductRow): CardFeature[] {
  const features: CardFeature[] = [];
  const name = product.name;
  const seen = new Set<string>();

  const push = (icon: LucideIcon, label: string) => {
    const key = label.toLowerCase();
    if (seen.has(key) || features.length >= 4) return;
    seen.add(key);
    features.push({ icon, label });
  };

  if (/powder[- ]free/i.test(name)) push(Sparkles, "Powder-Free");
  if (/latex[- ]free/i.test(name)) push(Shield, "Latex-Free");

  const milMatch = name.match(/(\d+(?:\.\d+)?)\s*mil/i);
  if (milMatch) push(Layers, `${milMatch[1]} mil Thickness`);

  for (const cert of product.certificationHints) {
    const label = displayCertLabel(cert);
    if (/food|fda/i.test(label)) push(UtensilsCrossed, "Food Safe");
    else if (/latex/i.test(label)) push(Shield, "Latex-Free");
    else if (/astm|iso|en\s|fda|aql/i.test(label)) push(Shield, label);
    else push(Shield, label);
  }

  if (/ambidextrous/i.test(name)) push(Hand, "Ambidextrous");

  if (product.materialHint) push(Layers, product.materialHint);

  return features.slice(0, 4);
}

function CardFeatureGrid({ features, surface }: { features: CardFeature[]; surface: StoreProductCardSurface }) {
  if (features.length === 0) return null;
  const isLight = surface === "light";

  return (
    <ul className="grid list-none grid-cols-2 gap-x-2 gap-y-1 p-0">
      {features.map(({ icon: Icon, label }) => (
        <li key={label} className="flex min-w-0 items-center gap-1">
          <Icon
            className={cn("h-3 w-3 shrink-0", isLight ? "text-neutral-400" : "text-white/40")}
            strokeWidth={2}
            aria-hidden
          />
          <span className={cn("truncate text-[10px] font-medium", isLight ? "text-neutral-600" : "text-white/65")}>
            {label}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CardSizeSelector({
  product,
  surface,
  selectedSize,
  onSelectSize,
}: {
  product: StoreProductRow;
  surface: StoreProductCardSurface;
  selectedSize: string | null;
  onSelectSize: (size: string) => void;
}) {
  const sizes = product.availableSizeCodes;
  if (sizes.length === 0) return null;
  const isLight = surface === "light";
  const multi = productRequiresSizeSelection(product);

  return (
    <div className="space-y-1">
      <p className={cn("text-[9px] font-semibold", isLight ? "text-neutral-500" : "text-white/45")}>Available sizes</p>
      <div className="flex flex-wrap gap-1">
        {sizes.map((size) => {
          const selected = selectedSize === size || (!multi && product.sizeCode === size);
          return (
            <button
              key={size}
              type="button"
              onClick={() => onSelectSize(size)}
              className={cn(
                "min-w-[1.75rem] rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition",
                selected
                  ? "border-brand bg-brand text-white"
                  : isLight
                    ? "border-border-light bg-white text-ink hover:border-brand/40"
                    : "border-white/15 bg-white/5 text-white/80 hover:border-brand/40"
              )}
            >
              {size}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StoreProductCard({
  product,
  surface = "dark",
  rankLabel,
}: {
  product: StoreProductRow;
  surface?: StoreProductCardSurface;
  /** Optional survey rank badge (e.g. "#2"). */
  rankLabel?: string;
}) {
  const isLight = surface === "light";
  const [selectedSize, setSelectedSize] = React.useState<string | null>(product.sizeCode);

  const displayCasePrice = product.casePrice ?? product.bestPrice;
  const features = React.useMemo(() => deriveCardFeatures(product), [product]);
  const showCasePricing = displayCasePrice != null;
  const showPalletPricing = product.palletPricingAvailable && product.palletPrice != null;
  const pricingColumns =
    showCasePricing || showPalletPricing ? (
      <div
        className={cn(
          "grid gap-2",
          showCasePricing && showPalletPricing ? "grid-cols-2" : "grid-cols-1"
        )}
      >
        {showCasePricing ? (
          <CommercePriceColumn
            heading={packUnitHeading("case", product.caseLabel)}
            listPrice={product.caseListPrice}
            salePrice={displayCasePrice}
            onSale={product.caseOnSale}
            unitLabel="case"
            light={isLight}
          />
        ) : null}
        {showPalletPricing ? (
          <CommercePriceColumn
            heading={packUnitHeading("pallet", product.palletLabel)}
            listPrice={product.palletListPrice}
            salePrice={product.palletPrice}
            onSale={product.palletOnSale}
            unitLabel="pallet"
            light={isLight}
          />
        ) : null}
      </div>
    ) : (
      <div className={cn("text-[10px] font-medium", isLight ? "text-neutral-500" : "text-white/45")}>
        Request pricing
      </div>
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
            "relative aspect-square w-full",
            isLight ? "bg-neutral-100" : "bg-black/40"
          )}
        >
          <StoreBadgeStack labels={product.badges} />
          {rankLabel ? (
            <span className="absolute left-2 top-2 z-10 rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
              {rankLabel}
            </span>
          ) : null}
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

      <CardHeader className="flex flex-1 flex-col gap-1.5 px-3 pb-2 pt-2.5">
        {product.brandName ? (
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-brand">{product.brandName}</div>
        ) : null}
        <CardTitle
          className={cn(
            "text-left text-[14px] font-bold leading-snug",
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
        <CardFeatureGrid features={features} surface={surface} />
        <CardSizeSelector
          product={product}
          surface={surface}
          selectedSize={selectedSize}
          onSelectSize={setSelectedSize}
        />
        <div className="pt-0.5">{pricingColumns}</div>
      </CardHeader>

      <CardContent className="mt-auto flex flex-col gap-2 px-3 pb-3 pt-0">
        {needsSize ? (
          <Button asChild className="h-10 w-full bg-brand text-xs font-bold text-white hover:bg-brand-hover">
            <Link href={selectSizeHref}>Select size</Link>
          </Button>
        ) : showQuote ? (
          <AddToQuoteButton product={product} className="h-10 text-xs font-bold" />
        ) : (
          <Button
            asChild
            variant="outline"
            className="h-10 w-full border-brand/45 text-xs font-semibold text-brand hover:bg-brand/10"
          >
            <Link href="/request-pricing">Request pricing</Link>
          </Button>
        )}
        <Link
          href={pdpHref}
          className={cn(
            "flex items-center justify-center gap-1 border-t py-2.5 text-[10px] font-semibold transition-colors hover:text-brand",
            isLight ? "border-border-light text-neutral-500" : "border-white/10 text-white/55"
          )}
        >
          View details
          <ChevronRight className="h-3 w-3" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
