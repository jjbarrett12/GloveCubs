import { INDUSTRIES } from "@/config/industries";
import { IndustryLandingTemplate } from "@/components/industry/IndustryLandingTemplate";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Janitorial Contractors | GloveCubs",
  description: INDUSTRIES.janitorial.tagline,
};

export default function JanitorialPage() {
  return <IndustryLandingTemplate config={INDUSTRIES.janitorial} />;
}
