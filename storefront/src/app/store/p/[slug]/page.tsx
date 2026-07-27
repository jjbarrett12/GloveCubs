import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  enrichStoreProductDetailBuyerPricing,
  fetchStoreProductDetail,
} from "@/lib/catalog/store-product-detail";
import { StorePdpContent } from "@/components/store/pdp/StorePdpContent";
import { StorePageShell } from "@/components/store/StorePageShell";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { isCatalogSupabaseEmergencyDisabled } from "@/lib/catalog/emergency-catalog-kill-switch";
import {
  assertCustomerCompanyAccess,
  resolveCustomerProcurementGate,
} from "@/lib/procurement/customer-procurement-session";

export const dynamic = "force-dynamic";

type PageProps = { params: { slug: string } };

function siteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL;
  if (!raw) return null;
  return raw.startsWith("http") ? raw.replace(/\/$/, "") : `https://${raw.replace(/\/$/, "")}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (isCatalogSupabaseEmergencyDisabled()) {
    return {
      title: "Catalog temporarily unavailable | GloveCubs",
      robots: { index: false, follow: true },
    };
  }
  const detail = await fetchStoreProductDetail(params.slug);
  if (!detail) {
    return {
      title: "Product | GloveCubs",
      robots: { index: false, follow: true },
    };
  }
  const title = `${detail.name} | GloveCubs`;
  const description =
    detail.description && detail.description.trim()
      ? detail.description.trim().slice(0, 160)
      : `${detail.name} — B2B gloves and disposables from GloveCubs.`;
  const path = `/store/p/${detail.slug}`;
  const origin = siteOrigin();
  const canonical = origin ? `${origin}${path}` : path;
  const meta: Metadata = {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description },
  };
  if (origin) {
    meta.openGraph = { ...meta.openGraph, url: `${origin}${path}` };
  }
  return meta;
}

function CatalogUnavailablePdp() {
  return (
    <main className="py-8 sm:py-10">
      <StorePageShell>
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-5 text-sm text-amber-950">
          <p className="m-0 text-base font-semibold">Catalog listings are temporarily unavailable</p>
          <p className="mt-2 m-0 leading-relaxed">
            Product pages are paused while we contain catalog infrastructure load. Request pricing or upload an
            invoice and our team will help source the right products.
          </p>
          <p className="mt-3 m-0 flex flex-wrap gap-3">
            <Link href="/request-pricing" className="font-semibold text-[#f06232] hover:underline">
              Request pricing
            </Link>
            <Link href="/invoice-savings" className="font-semibold text-[#f06232] hover:underline">
              Upload invoice
            </Link>
            <Link href="/quote-cart" className="font-semibold text-[#f06232] hover:underline">
              Quote cart
            </Link>
          </p>
        </div>
      </StorePageShell>
    </main>
  );
}

export default async function StoreProductPage({ params }: PageProps) {
  if (isCatalogSupabaseEmergencyDisabled()) {
    return <CatalogUnavailablePdp />;
  }

  let detail = await fetchStoreProductDetail(params.slug);
  if (!detail) notFound();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin() as any;
    const gate = await resolveCustomerProcurementGate(supabase);
    if (gate.kind === "ready") {
      const { userId, companyId } = gate.session;
      const allowed = await assertCustomerCompanyAccess(supabase, userId, companyId);
      if (allowed) {
        detail = await enrichStoreProductDetailBuyerPricing(detail, companyId);
      }
    }
  }

  return <StorePdpContent detail={detail} />;
}
