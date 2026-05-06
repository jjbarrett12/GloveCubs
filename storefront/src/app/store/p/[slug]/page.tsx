import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchStoreProductDetail } from "@/lib/catalog/store-product-detail";
import { StorePdpContent } from "@/components/store/pdp/StorePdpContent";

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
    return { title: "Product | GloveCubs" };
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
  return <StorePdpContent detail={detail} />;
}
