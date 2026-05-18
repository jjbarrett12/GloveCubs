import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { HomeHeroExpress } from "@/components/home/HomeHeroExpress";
import { HomeOperationalProofSection } from "@/components/home/HomeOperationalProofSection";
import { HomeProcurementPainSection } from "@/components/home/HomeProcurementPainSection";
import { HomeBulkWorkflowSection } from "@/components/home/HomeBulkWorkflowSection";
import { HomeConsolidatedTrustSection } from "@/components/home/HomeConsolidatedTrustSection";
import { HomeShopShortcutsSection } from "@/components/home/HomeShopShortcutsSection";
import { HomeFeaturedCatalogSection } from "@/components/home/HomeFeaturedCatalogSection";
import { HomeWhoSection } from "@/components/home/HomeWhoSection";
import { HomeReorderStorySection } from "@/components/home/HomeReorderStorySection";
import {
  HomeHowInvoiceWorksSection,
  HomeRecommendationExplainerSection,
  HomeHumanAdvisorSection,
} from "@/components/home/HomeConversionJourneySections";
import { HomeBulkPricingSection } from "@/components/home/HomeBulkPricingSection";
import { HomeProductFinderSection } from "@/components/home/HomeProductFinderSection";
import { HomeFinalCtaStrip } from "@/components/home/HomeFinalCtaStrip";
import { ServiceAreaPanel } from "@/components/home/ServiceAreaPanel";

/** Featured strip reads live catalog—avoid baking a build-time snapshot. */
export const dynamic = "force-dynamic";

/** Procurement OS narrative: proof → pain → workflow → catalog → repeat buy → quote paths. */
export default function HomePage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-surface-base font-poppins">
      <SiteHeaderLoader />
      <HomeHeroExpress />
      <HomeOperationalProofSection />
      <HomeProcurementPainSection />
      <HomeBulkWorkflowSection />
      <HomeConsolidatedTrustSection />
      <HomeShopShortcutsSection />
      <HomeFeaturedCatalogSection />
      <HomeWhoSection />
      <HomeReorderStorySection />
      <HomeHowInvoiceWorksSection />
      <HomeRecommendationExplainerSection />
      <HomeBulkPricingSection />
      <ServiceAreaPanel />
      <HomeHumanAdvisorSection />
      <HomeProductFinderSection />
      <HomeFinalCtaStrip />
      <SiteFooter />
    </div>
  );
}
