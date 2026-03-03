import { INDUSTRIES } from "@/config/industries";
import { IndustryLandingTemplate } from "@/components/industry/IndustryLandingTemplate";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Healthcare | GloveCubs",
  description: INDUSTRIES.healthcare.tagline,
};

export default function HealthcarePage() {
  return <IndustryLandingTemplate config={INDUSTRIES.healthcare} />;
}
