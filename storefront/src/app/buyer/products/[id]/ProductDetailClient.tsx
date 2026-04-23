"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ProductOffersClient } from "./ProductOffersClient";

export interface VariantOption {
  id: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  is_listing_primary: boolean;
}

interface ProductDetailClientProps {
  initialProductId: string;
  /** Shown in header (typically listing / primary name). */
  displayName: string;
  displayTitle?: string | null;
  category?: string | null;
  variants: VariantOption[];
}

function variantLabel(v: VariantOption): string {
  const parts = [v.size, v.color].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  return v.sku || v.id.slice(0, 8);
}

export function ProductDetailClient({
  initialProductId,
  displayName,
  displayTitle,
  category,
  variants,
}: ProductDetailClientProps) {
  const [selectedId, setSelectedId] = useState(initialProductId);

  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? variants[0],
    [variants, selectedId]
  );

  const attributeLine = selected
    ? [selected.size && `Size ${selected.size}`, selected.color && selected.color].filter(Boolean)
    : [];

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/buyer/dashboard" className="hover:text-gray-700">
          Dashboard
        </Link>
        <span>›</span>
        <Link href="/buyer/products" className="hover:text-gray-700">
          Products
        </Link>
        <span>›</span>
        <span className="text-gray-900 font-medium truncate max-w-xs">{displayName}</span>
      </nav>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
            {displayTitle && displayTitle !== displayName && (
              <p className="text-gray-600 mt-1">{displayTitle}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {selected?.sku && (
                <span className="font-mono text-sm text-gray-500">{selected.sku}</span>
              )}
              {category && (
                <>
                  <span className="text-gray-300 hidden sm:inline">•</span>
                  <span className="text-sm text-gray-600">{category}</span>
                </>
              )}
            </div>
            {attributeLine.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {attributeLine.map((attr, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full"
                  >
                    {attr}
                  </span>
                ))}
              </div>
            )}
          </div>

          {variants.length > 1 && (
            <div className="w-full sm:w-64 shrink-0">
              <label htmlFor="variant-select" className="block text-xs font-medium text-gray-500 mb-1">
                Variant
              </label>
              <select
                id="variant-select"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {variantLabel(v)}
                    {v.is_listing_primary ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Supplier Offers</h2>
        <ProductOffersClient key={selectedId} productId={selectedId} />
      </div>
    </div>
  );
}
