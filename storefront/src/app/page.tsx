import type { Metadata } from "next";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { HomeHeroExpress } from "@/components/home/HomeHeroExpress";
import { HomeInvoiceUploadPromo } from "@/components/home/HomeInvoiceUploadPromo";
import { HomeTrustLine } from "@/components/home/HomeTrustLine";
import { HomeWhoSection } from "@/components/home/HomeWhoSection";
import { HomeProductFinderSection } from "@/components/home/HomeProductFinderSection";
import { HomeTrustTilesSection } from "@/components/home/HomeTrustTilesSection";
import { ServiceAreaPanel } from "@/components/home/ServiceAreaPanel";

export const metadata: Metadata = {
  title: "GloveCubs | Distributor-Level Glove Pricing for Bulk Buyers",
  description:
    "GloveCubs helps restaurants, janitorial teams, healthcare buyers, hospitality groups and industrial operators request bulk glove pricing, upload invoices and source gloves by the case.",
};

/**
 * Canonical V1 homepage order: hero → invoice promo → supporting sections.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a] font-poppins">
      <SiteHeader />
      <HomeHeroExpress />
      <HomeInvoiceUploadPromo />
      <HomeTrustLine />
      <HomeWhoSection />
      <HomeProductFinderSection />
      <HomeTrustTilesSection />
      <ServiceAreaPanel />
      <SiteFooter />
    </div>
  );
}
