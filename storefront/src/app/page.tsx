import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { HomeHeroExpress } from "@/components/home/HomeHeroExpress";
import { HomeIndustriesTrustSection } from "@/components/home/HomeIndustriesTrustSection";
import { HomeFeaturedCatalogSection } from "@/components/home/HomeFeaturedCatalogSection";
import { HomeProcurementIntelligenceSection } from "@/components/home/HomeProcurementIntelligenceSection";
import { ServiceAreaPanel } from "@/components/home/ServiceAreaPanel";

/** Featured strip reads live catalog—avoid baking a build-time snapshot. */
export const dynamic = "force-dynamic";

/**
 * V4 homepage — six content sections after header:
 * Hero → Industries/Brands → Catalog → Spec/Intelligence → Map → Footer
 */
export default function HomePage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-white font-poppins text-neutral-900">
      <SiteHeaderLoader />
      <HomeHeroExpress />
      <HomeIndustriesTrustSection />
      <HomeFeaturedCatalogSection />
      <HomeProcurementIntelligenceSection />
      <ServiceAreaPanel />
      <SiteFooter />
    </div>
  );
}
