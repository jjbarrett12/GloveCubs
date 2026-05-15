import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchStoreProductDetail } from "@/lib/catalog/store-product-detail";
import { StorePdpContent, type BuyerUnitReference } from "@/components/store/pdp/StorePdpContent";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  assertCustomerCompanyAccess,
  resolveCustomerProcurementGate,
} from "@/lib/procurement/customer-procurement-session";
import { resolveBuyerUnitPriceViaRpc } from "@/lib/pricing/resolve-buyer-unit-price";
import { b2bTierLabel } from "@/lib/pricing/b2b-tier-meta";

export const dynamic = "force-dynamic";

type PageProps = { params: { slug: string } };

function siteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL;
  if (!raw) return null;
  return raw.startsWith("http") ? raw.replace(/\/$/, "") : `https://${raw.replace(/\/$/, "")}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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

export default async function StoreProductPage({ params }: PageProps) {
  const detail = await fetchStoreProductDetail(params.slug);
  if (!detail) notFound();

  let buyerUnitReference: BuyerUnitReference | null = null;

  if (isSupabaseConfigured() && detail.defaultVariant?.id) {
    const supabase = getSupabaseAdmin() as any;
    const gate = await resolveCustomerProcurementGate(supabase);
    if (gate.kind === "ready") {
      const { userId, companyId } = gate.session;
      const allowed = await assertCustomerCompanyAccess(supabase, userId, companyId);
      if (allowed) {
        const r = await resolveBuyerUnitPriceViaRpc(supabase, {
          companyId,
          catalogVariantId: detail.defaultVariant.id,
          quantity: 1,
        });
        if (
          r.ok &&
          r.data.pricing_source === "site_best_offer_x_company_tier_v1" &&
          r.data.resolved_unit_price_major != null &&
          r.data.list_unit_price_major != null
        ) {
          buyerUnitReference = {
            tierLabel: b2bTierLabel(r.data.pricing_tier_code),
            tierCode: r.data.pricing_tier_code,
            listUsd: r.data.list_unit_price_major,
            yourUsd: r.data.resolved_unit_price_major,
            pricingSource: r.data.pricing_source,
          };
        }
      }
    }
  }

  return <StorePdpContent detail={detail} buyerUnitReference={buyerUnitReference} />;
}
