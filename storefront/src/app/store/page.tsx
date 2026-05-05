import Link from "next/link";
import { fetchStoreProducts } from "@/lib/catalog/store-products";
import { StoreGrid } from "@/components/quote/StoreGrid";
import { QuoteCartNavLink } from "@/components/quote/QuoteCartNavLink";

/** Fresh catalog reads on each request (Supabase). */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Store | GloveCubs",
  description: "Browse products from the GloveCubs catalog.",
};

export default async function StorePage() {
  const { products, error } = await fetchStoreProducts();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold text-white">
            GloveCubs
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/" className="text-white/80 hover:text-white text-sm">
              Home
            </Link>
            <QuoteCartNavLink />
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-white mb-2">Store</h1>
        <p className="text-white/60 text-sm mb-8">Active products from the catalog.</p>

        {error && (
          <p className="text-sm text-amber-200/90 border border-amber-500/30 rounded-lg px-4 py-3 bg-amber-500/10">
            {error}
          </p>
        )}

        {!error && products.length === 0 && (
          <p className="text-white/50 text-sm">No active products found.</p>
        )}

        <StoreGrid products={products} />
      </main>
    </div>
  );
}
