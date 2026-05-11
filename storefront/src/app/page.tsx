import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { HomeHeroExpress } from "@/components/home/HomeHeroExpress";
import { HomeTrustLine } from "@/components/home/HomeTrustLine";
import { HomeShopShortcutsSection } from "@/components/home/HomeShopShortcutsSection";
import { HomeBusinessBuyerSection } from "@/components/home/HomeBusinessBuyerSection";
import { HomeFeaturedCatalogSection } from "@/components/home/HomeFeaturedCatalogSection";
import {
  HomeHowInvoiceWorksSection,
  HomeRecommendationExplainerSection,
  HomeReorderSimplificationSection,
  HomeHumanAdvisorSection,
} from "@/components/home/HomeConversionJourneySections";
import { HomeTrustTilesSection } from "@/components/home/HomeTrustTilesSection";
import { HomeWhoSection } from "@/components/home/HomeWhoSection";
import { HomeProductFinderSection } from "@/components/home/HomeProductFinderSection";
import { HomeReorderAccountBand } from "@/components/home/HomeReorderAccountBand";
import { ServiceAreaPanel } from "@/components/home/ServiceAreaPanel";

/** Featured strip reads live catalog—avoid baking a build-time snapshot. */
export const dynamic = "force-dynamic";

/** Supplier-first homepage: catalog proof → trust → optional invoice depth. */
export default function HomePage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-[#0a0a0a] font-poppins">
      <SiteHeaderLoader />
      <HomeHeroExpress />
      <HomeTrustLine />
      <HomeShopShortcutsSection />
      <HomeBusinessBuyerSection />
      <HomeFeaturedCatalogSection />
      <HomeWhoSection />
      <HomeTrustTilesSection />
      <HomeReorderAccountBand />
      <HomeReorderSimplificationSection />
      <HomeHowInvoiceWorksSection />
      <HomeRecommendationExplainerSection />
      <HomeHumanAdvisorSection />
      <HomeProductFinderSection />
      <ServiceAreaPanel />
      <SiteFooter />
    </div>
  );
}
