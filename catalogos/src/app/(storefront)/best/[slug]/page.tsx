import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSeoLandingBySlug } from "@/lib/conversion/seo-landings";
import { listLiveProducts } from "@/lib/catalog/query";
import { getFirstImageByProductIds } from "@/lib/catalog/query";
import { enrichCatalogItems, sortByPricePerGlove } from "@/lib/conversion";
import { resolveProductImageUrl } from "@/lib/images";

/** DB-backed; avoid build-time prerender without Supabase env. */
export const dynamic = "force-dynamic";

export interface BestPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BestPageProps): Promise<Metadata> {
  const { slug } = await params;
  const config = getSeoLandingBySlug(slug);
  if (!config) return { title: "Not found" };
  return {
    title: `${config.title} | GloveCubs`,
    description: config.description,
  };
}

function getAttr(attrs: Record<string, unknown>, key: string): string {
  const v = attrs?.[key];
  if (v == null) return "—";
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v).replace(/_/g, " ");
}

export default async function BestLandingPage({ params }: BestPageProps) {
  const { slug } = await params;
  const config = getSeoLandingBySlug(slug);
  if (!config) notFound();

  const paramsWithPage = { ...config.filters, page: 1, limit: config.limit };
  const payload = await listLiveProducts(paramsWithPage);
  const enriched = enrichCatalogItems(payload.items, null);
  sortByPricePerGlove(enriched);
  const top = enriched.slice(0, 6);
  const productIds = top.map((e) => e.item.id);
  const imageByProductId = await getFirstImageByProductIds(productIds);

  const minPerGlove = Math.min(
    ...top
      .map((e) => e.pricePerGlove.price_per_glove)
      .filter((p): p is number => p != null && p > 0)
  );
  const minCase = Math.min(
    ...top.map((e) => e.item.best_price).filter((p): p is number => p != null && p > 0)
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <nav className="text-sm text-muted-foreground">
        <Link href="/catalog/disposable_gloves" className="hover:text-foreground hover:underline">
          ← Catalog
        </Link>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {config.title}
        </h1>
        <p className="mt-2 text-muted-foreground">{config.description}</p>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Compare top options</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Material</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Thickness</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Price/glove</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Case</th>
              </tr>
            </thead>
            <tbody>
              {top.map((e) => {
                const slugOrId = e.item.slug ?? e.item.id;
                const isBestPerGlove = e.pricePerGlove.price_per_glove === minPerGlove;
                const isBestCase = e.item.best_price === minCase;
                return (
                  <tr key={e.item.id} className="border-b border-border/50">
                    <td className="px-3 py-2">
                      <Link
                        href={`/product/${slugOrId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {e.item.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{getAttr(e.item.attributes ?? {}, "material")}</td>
                    <td className="px-3 py-2">{getAttr(e.item.attributes ?? {}, "thickness_mil")} mil</td>
                    <td className={`px-3 py-2 ${isBestPerGlove ? "bg-primary/10 font-medium" : ""}`}>
                      {e.pricePerGlove.display_per_glove}
                    </td>
                    <td className={`px-3 py-2 ${isBestCase ? "bg-primary/10 font-medium" : ""}`}>
                      {e.pricePerGlove.display_case}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Recommended gloves</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {top.map((e) => {
            const slugOrId = e.item.slug ?? e.item.id;
            const img = resolveProductImageUrl(imageByProductId.get(e.item.id));
            return (
              <li key={e.item.id}>
                <Link
                  href={`/product/${slugOrId}`}
                  className="block rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="aspect-square w-full overflow-hidden rounded bg-muted">
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-2 font-medium line-clamp-2">{e.item.name}</p>
                  <p className="text-sm text-muted-foreground">{e.pricePerGlove.display_per_glove}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-center">
        <Link
          href="/catalog/disposable_gloves"
          className="font-medium text-primary hover:underline"
        >
          Browse full catalog →
        </Link>
      </p>
    </div>
  );
}
