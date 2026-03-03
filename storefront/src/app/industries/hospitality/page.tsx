import { INDUSTRIES } from "@/config/industries";
import { IndustryLandingTemplate } from "@/components/industry/IndustryLandingTemplate";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hospitality | GloveCubs",
  description: INDUSTRIES.hospitality.tagline,
};

export default function HospitalityPage() {
  return <IndustryLandingTemplate config={INDUSTRIES.hospitality} />;
}
