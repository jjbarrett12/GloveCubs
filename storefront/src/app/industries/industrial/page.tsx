import { INDUSTRIES } from "@/config/industries";
import { IndustryLandingTemplate } from "@/components/industry/IndustryLandingTemplate";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Industrial & Manufacturing | GloveCubs",
  description: INDUSTRIES.industrial.tagline,
};

export default function IndustrialPage() {
  return <IndustryLandingTemplate config={INDUSTRIES.industrial} />;
}
