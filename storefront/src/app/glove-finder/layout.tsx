import type { Metadata } from "next";
import { PublicExperienceChrome } from "@/components/layout/PublicExperienceChrome";

export const metadata: Metadata = {
  title: "Guided Glove Finder | GloveCubs",
  description:
    "Catalog-backed wizard for task, material, and risk—starting points for quote review, not compliance approval.",
};

export default function GloveFinderLayout({ children }: { children: React.ReactNode }) {
  return <PublicExperienceChrome className="min-h-screen bg-[hsl(var(--background))] font-poppins">{children}</PublicExperienceChrome>;
}
