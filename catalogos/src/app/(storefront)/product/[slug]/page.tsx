import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import Script from "next/script";
import { getProductDetailBySlug, getOffersSummaryByProductId, listLiveProducts, getFirstImageByProductIds } from "@/lib/catalog/query";
import { resolveProductImageUrl } from "@/lib/images";
import { computePricePerGlove } from "@/lib/conversion/price-per-glove";
import { computeSignalsForProduct } from "@/lib/conversion/value-signals";
import { computeAuthorityBadge } from "@/lib/conversion/authority-signals";
import { INDUSTRY_OPTIONS } from "@/lib/conversion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductQuoteActions } from "./ProductQuoteActions";
import { ProductPageActions } from "./ProductPageActions";
import { RelatedGloves } from "./RelatedGloves";
import { ProductImageGallery } from "@/components/storefront/ProductImageGallery";
import { SupplierOffersDisclosure } from "@/components/storefront/SupplierOffersDisclosure";
import { VariantDimensionsStrip } from "./VariantDimensionsStrip";
import { normalizeCompareAttributes } from "@/lib/catalog/compare-attributes";
import { getInventoryDisplay } from "@/lib/catalog/inventory-display";

export interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductDetailBySlug(slug);
  if (!product) return { title: "Product not found", robots: { index: false } };
  const description =
    product.description?.replace(/\s+/g, " ").trim().slice(0, 155) ??
    `Request a quote for ${product.name} — industrial gloves and PPE from GloveCubs.`;
  const ogImage = product.images?.[0] ? resolveProductImageUrl(product.images[0]) : undefined;
  return {
    title: `${product.name} | GloveCubs`,
    description,
    keywords: [
      product.name,
      product.brand_name,
      product.category_slug,
      "gloves",
      "PPE",
      "B2B",
    ].filter(Boolean) as string[],
    alternates: { canonical: `/product/${slug}` },
    openGraph: {
      title: product.name,
      description,
      type: "website",
      url: `/product/${slug}`,
      images: ogImage ? [{ url: ogImage, alt: product.name }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: ogImage ? [ogImage] : [],
    },
    robots: { index: true, follow: true },
  };
}

function formatLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v).replace(/_/g, " ");
}

function recommendedIndustriesForProduct(attrs: Record<string, unknown>): { label: string }[] {
  const raw = attrs?.industries ?? attrs?.industry;
  const arr = Array.isArray(raw) ? raw : raw != null ? [String(raw)] : [];
  return INDUSTRY_OPTIONS.filter((opt) =>
    opt.filterValues.some((v) => arr.some((a) => String(a).toLowerCase() === v.toLowerCase()))
  ).map((opt) => ({ label: opt.badgeLabel }));
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductDetailBySlug(slug);
  if (!product) notFound();

  const [offersSummary, relatedPayload] = await Promise.all([
    getOffersSummaryByProductId(product.id),
    listLiveProducts({
      category: product.category_slug ?? undefined,
      limit: 4,
      page: 1,
    }),
  ]);

  const attrs = (product.attributes ?? {}) as Record<string, unknown>;
  const attrEntries = Object.entries(attrs).filter(([, v]) => v != null && v !== "");
  const pricePerGlove = computePricePerGlove(product);
  const signals = computeSignalsForProduct(product);
  const authorityBadge = computeAuthorityBadge(product);
  const recommendedIndustries = recommendedIndustriesForProduct(attrs);
  const related = (relatedPayload.items ?? []).filter((p) => p.id !== product.id).slice(0, 4);
  const relatedIds = related.map((p) => p.id);
  const relatedImages = relatedIds.length ? await getFirstImageByProductIds(relatedIds) : new Map<string, string>();
  const compareAttributes = normalizeCompareAttributes(attrs);
  const inventory = getInventoryDisplay(attrs, offersSummary.offer_count);

  const primaryImage = product.images?.[0] ? resolveProductImageUrl(product.images[0]) : undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    sku: product.sku,
    brand: product.brand_name ? { "@type": "Brand", name: product.brand_name } : undefined,
    image: primaryImage ? [primaryImage] : undefined,
    offers:
      offersSummary.offer_count > 0 && offersSummary.best_price > 0
        ? {
            "@type": "AggregateOffer",
            priceCurrency: "USD",
            lowPrice: offersSummary.best_price,
            highPrice: offersSummary.best_price,
            offerCount: offersSummary.offer_count,
            availability: "https://schema.org/InStock",
          }
        : undefined,
  };

  return (
    <div className="space-y-8 px-1 sm:px-0">
      <Script id="product-jsonld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(jsonLd)}
      </Script>

      <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
        {product.category_slug && (
          <Link href={`/catalog/${product.category_slug}`} className="hover:text-foreground hover:underline">
            ← {product.category_slug.replace(/_/g, " ")}
          </Link>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        <div className="min-w-0">
          <ProductImageGallery urls={product.images ?? []} productName={product.name} />
        </div>

        <div className="min-w-0 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{product.name}</h1>
            {product.brand_name && <p className="mt-1 text-muted-foreground">{product.brand_name}</p>}
            {product.sku && <p className="mt-0.5 text-xs text-muted-foreground">Catalog SKU: {product.sku}</p>}
            <p
              className={`mt-3 text-sm ${
                inventory.tone === "positive"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : inventory.tone === "warning"
                    ? "text-amber-800 dark:text-amber-200"
                    : "text-muted-foreground"
              }`}
            >
              {inventory.label}
            </p>
            {authorityBadge && (
              <Badge variant="success" className="mt-2">
                {authorityBadge.label}
              </Badge>
            )}
            {signals.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {signals.map((s) => (
                  <Badge key={s.key} variant="secondary">
                    {s.label}
                  </Badge>
                ))}
              </div>
            )}
            {recommendedIndustries.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Recommended for: {recommendedIndustries.map((r) => r.label).join(", ")}
              </p>
            )}
          </div>

          <VariantDimensionsStrip categorySlug={product.category_slug} attributes={attrs} />

          {offersSummary.offer_count > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your price</p>
              <div className="mt-1 flex flex-col gap-1">
                {pricePerGlove.price_per_glove != null && (
                  <p className="text-lg font-semibold text-foreground">{pricePerGlove.display_per_glove}</p>
                )}
                <p className="text-2xl font-semibold text-foreground tabular-nums">{pricePerGlove.display_case}</p>
                {pricePerGlove.gloves_per_box != null && pricePerGlove.gloves_per_box > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {pricePerGlove.gloves_per_box} gloves per case · Case pricing for bulk orders
                  </p>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Best case price across {offersSummary.offer_count} active supplier offer
                {offersSummary.offer_count !== 1 ? "s" : ""}.
              </p>
              <ProductQuoteActions
                productId={product.id}
                slug={product.slug ?? slug}
                name={product.name}
                unitPrice={offersSummary.best_price}
                sku={product.sku}
              />
              <ProductPageActions
                productId={product.id}
                slug={product.slug ?? slug}
                name={product.name}
                bestPrice={offersSummary.best_price}
                pricePerGlove={pricePerGlove}
                compareAttributes={compareAttributes}
              />
            </div>
          )}

          {attrEntries.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Specifications</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {attrEntries.map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-2 border-b border-border/50 pb-2 last:border-0">
                      <dt className="text-muted-foreground">{formatLabel(key)}</dt>
                      <dd className="text-right font-medium text-foreground">{formatValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}

          {product.description && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{product.description}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {offersSummary.offers.length > 0 && <SupplierOffersDisclosure offers={offersSummary.offers} />}

      {related.length > 0 && (
        <RelatedGloves
          products={related}
          imageByProductId={Object.fromEntries(relatedImages)}
          currentProductId={product.id}
        />
      )}
    </div>
  );
}
