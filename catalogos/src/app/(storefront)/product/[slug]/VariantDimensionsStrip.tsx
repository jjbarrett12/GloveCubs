import Link from "next/link";
import { getProductTypeDefinition, isImplementedProductTypeKey } from "@/lib/product-types";

function formatLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v).replace(/_/g, " ");
}

interface VariantDimensionsStripProps {
  categorySlug?: string;
  attributes: Record<string, unknown>;
}

/**
 * Surfaces registry variant dimensions for this product type (one catalog SKU = one configuration).
 * Links jump to the category with the same facet selected in the query string.
 */
export function VariantDimensionsStrip({ categorySlug, attributes }: VariantDimensionsStripProps) {
  if (!categorySlug || !isImplementedProductTypeKey(categorySlug)) return null;
  const def = getProductTypeDefinition(categorySlug);
  if (!def) return null;

  const chips: { key: string; label: string; value: string; href: string }[] = [];
  for (const dim of def.variantDimensions) {
    const v = attributes[dim];
    if (v == null || v === "") continue;
    const raw = Array.isArray(v) ? String(v[0]) : String(v);
    if (!raw) continue;
    const facetValue = raw.toLowerCase().trim().replace(/\s+/g, "_");
    const qs = new URLSearchParams();
    qs.set(dim, facetValue);
    const href = `/catalog/${categorySlug}?${qs.toString()}`;
    chips.push({
      key: dim,
      label: formatLabel(dim),
      value: formatValue(v),
      href,
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This configuration</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {chips.map((c) => (
          <li key={c.key}>
            <Link
              href={c.href}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted sm:min-h-0 sm:py-1.5"
            >
              <span className="text-muted-foreground">{c.label}:</span>
              <span className="font-medium">{c.value}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Each product page is one published SKU. Use category filters to find other sizes or materials.
      </p>
    </div>
  );
}
