import type { Metadata } from "next";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { GloveSciencePage } from "@/components/glove-science/GloveSciencePage";

export const metadata: Metadata = {
  title: "Science of Gloves — Materials, Mil, Cut Ratings & Buyer Guide | GloveCubs",
  description:
    "Learn glove materials, thickness, texture, cut resistance, certifications, and common buyer mistakes so your team can choose the right protection without overbuying.",
};

export default function GloveScienceRoutePage() {
  return (
    <div className="home-authority flex min-h-screen min-w-0 flex-col font-poppins">
      <SiteHeaderLoader />
      <GloveSciencePage />
      <SiteFooter />
    </div>
  );
}
