import { notFound } from "next/navigation";
import { INDUSTRIES, INDUSTRY_KEYS, type IndustryKey } from "@/config/industries";
import { IndustryLandingTemplate } from "@/components/industry/IndustryLandingTemplate";
import type { Metadata } from "next";

type Props = { params: Promise<{ industryKey: string }> };

export async function generateStaticParams() {
  return INDUSTRY_KEYS.map((industryKey) => ({ industryKey }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { industryKey } = await params;
  const config = INDUSTRIES[industryKey as IndustryKey];
  if (!config) return { title: "Industry | GloveCubs" };
  return {
    title: `${config.name} | GloveCubs`,
    description: config.tagline,
  };
}

export default async function IndustryPage({ params }: Props) {
  const { industryKey } = await params;
  const config = INDUSTRIES[industryKey as IndustryKey];
  if (!config) notFound();
  return <IndustryLandingTemplate config={config} />;
}
