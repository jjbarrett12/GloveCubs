import type { Metadata } from "next";
import { QuoteBasketProvider } from "@/contexts/QuoteBasketContext";
import { CompareProvider } from "@/components/storefront/CompareContext";
import { CompareDrawer } from "@/components/storefront/CompareDrawer";
import { StorefrontHeader } from "@/components/storefront/StorefrontHeader";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
};

export default function StorefrontLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <QuoteBasketProvider>
      <CompareProvider>
        <div className="min-h-screen overflow-x-hidden bg-background">
          <StorefrontHeader />
          <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
          <CompareDrawer />
        </div>
      </CompareProvider>
    </QuoteBasketProvider>
  );
}
