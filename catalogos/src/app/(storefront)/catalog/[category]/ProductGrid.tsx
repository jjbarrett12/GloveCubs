"use client";

import { useState } from "react";
import Link from "next/link";
import type { LiveProductItem } from "@/lib/catalog/types";
import { BulkQuoteModal } from "@/components/storefront/BulkQuoteModal";
import type { ValueSignal } from "@/lib/conversion";
import type { PricePerGloveResult } from "@/lib/conversion";
import { resolveProductImageUrl } from "@/lib/images";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddToQuoteButton } from "@/components/storefront/AddToQuoteButton";
import { useCompare } from "@/components/storefront/CompareContext";
import { trackConversionEvent } from "@/lib/conversion/analytics";
import { normalizeCompareAttributes } from "@/lib/catalog/compare-attributes";

export interface AuthorityBadgeType {
  key: string;
  label: string;
}

export interface ProductEnrichment {
  pricePerGlove: PricePerGloveResult;
  signals: ValueSignal[];
  industryBadge: string | null;
  recommendedForIndustry: boolean;
  authorityBadge?: AuthorityBadgeType | null;
}

interface ProductGridProps {
  items: LiveProductItem[];
  imageByProductId: Record<string, string>;
  enrichedByProductId?: Record<string, ProductEnrichment>;
}

const KEY_ATTRS = ["material", "size", "color", "thickness_mil", "grade"] as const;

function formatAttrValue(v: string): string {
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getAttr(attrs: Record<string, unknown>, key: string): string | null {
  const v = attrs?.[key];
  return v != null ? String(v).trim() || null : null;
}

export function ProductGrid({ items, imageByProductId, enrichedByProductId = {} }: ProductGridProps) {
  const { add: addToCompare, isInCompare, canAdd } = useCompare();
  const [bulkQuoteProduct, setBulkQuoteProduct] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => {
        const slug = item.slug ?? item.id;
        const imageUrl = resolveProductImageUrl(imageByProductId?.[item.id]);
        const attrs = (item.attributes ?? {}) as Record<string, unknown>;
        const enrichment = enrichedByProductId[item.id];
        const pricePerGlove = enrichment?.pricePerGlove;
        const signals = enrichment?.signals ?? [];
        const industryBadge = enrichment?.industryBadge ?? null;
        const authorityBadge = enrichment?.authorityBadge ?? null;
        const keyValues = KEY_ATTRS.map((k) => (getAttr(attrs, k) ? formatAttrValue(String(attrs[k])) : null)).filter(Boolean).slice(0, 3);
        const inCompare = isInCompare(item.id);

        const handleCompareClick = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (inCompare || !canAdd) return;
          addToCompare({
            id: item.id,
            slug: item.slug ?? null,
            name: item.name,
            attributes: normalizeCompareAttributes(item.attributes ?? {}),
            best_price: item.best_price ?? null,
            pricePerGlove: pricePerGlove ?? {
              display_per_glove: "—",
              display_case: item.best_price != null ? `$${Number(item.best_price).toFixed(0)} / case` : "—",
              price_per_glove: null,
              gloves_per_box: null,
            },
          });
          trackConversionEvent("product_compared", { product_id: item.id });
        };

        return (
          <li key={item.id}>
            <Link
              href={`/product/${slug}`}
              onClick={() => trackConversionEvent("product_clicked", { product_id: item.id, slug })}
            >
              <Card
                className={`h-full overflow-hidden transition-shadow hover:shadow-md ${enrichment?.recommendedForIndustry ? "ring-1 ring-primary/30" : ""}`}
              >
                <div className="relative aspect-square w-full bg-muted">
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                  <div className="absolute left-1 top-1 flex flex-wrap gap-1">
                    {authorityBadge && (
                      <Badge variant="success" className="text-[10px]">
                        {authorityBadge.label}
                      </Badge>
                    )}
                    {industryBadge && (
                      <Badge variant="default" className="text-[10px]">
                        {industryBadge}
                      </Badge>
                    )}
                    {signals.slice(0, 3).map((s) => (
                      <Badge key={s.key} variant="secondary" className="text-[10px]">
                        {s.label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <CardContent className="p-3">
                  <p className="font-medium text-foreground line-clamp-2">{item.name}</p>
                  {item.brand_name && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.brand_name}</p>
                  )}
                  {keyValues.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">{keyValues.join(" · ")}</p>
                  )}
                  <div className="mt-2 flex flex-col gap-0.5">
                    {pricePerGlove && (
                      <>
                        <p className="text-sm font-semibold text-foreground">
                          {pricePerGlove.display_per_glove}
                        </p>
                        <p className="text-xs text-muted-foreground">{pricePerGlove.display_case}</p>
                      </>
                    )}
                    {!pricePerGlove && item.best_price != null && (
                      <p className="text-sm font-semibold text-foreground">
                        From ${Number(item.best_price).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <AddToQuoteButton
                      productId={item.id}
                      slug={slug}
                      name={item.name}
                      unitPrice={item.best_price}
                      sku={item.sku}
                      variant="outline"
                      size="sm"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBulkQuoteProduct({ id: item.id, name: item.name }); }}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                    >
                      Request bulk pricing
                    </button>
                    <button
                      type="button"
                      onClick={handleCompareClick}
                      disabled={inCompare || !canAdd}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      {inCompare ? "In compare" : "Compare"}
                    </button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
    <BulkQuoteModal
      open={!!bulkQuoteProduct}
      onOpenChange={(open) => !open && setBulkQuoteProduct(null)}
      productId={bulkQuoteProduct?.id ?? ""}
      productName={bulkQuoteProduct?.name}
    />
    </>
  );
}
