import { SiteHeader } from "@/components/home/SiteHeader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { HomeHeroExpress } from "@/components/home/HomeHeroExpress";
import { HomeTrustLine } from "@/components/home/HomeTrustLine";
import {
  HomeHowInvoiceWorksSection,
  HomeRecommendationExplainerSection,
  HomeReorderSimplificationSection,
  HomeHumanAdvisorSection,
} from "@/components/home/HomeConversionJourneySections";
import { HomeTrustTilesSection } from "@/components/home/HomeTrustTilesSection";
import { HomeWhoSection } from "@/components/home/HomeWhoSection";
import { HomeProductFinderSection } from "@/components/home/HomeProductFinderSection";
import { ServiceAreaPanel } from "@/components/home/ServiceAreaPanel";

/** Conversion-first homepage: invoice upload → clarity → catalog depth. */
export default function HomePage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-[#0a0a0a] font-poppins">
      {/* Header + footer wordmark: /images/glovecubs-header-logo.png; footer uses luminance mask for white glyphs + paw cutout. */}
      <SiteHeader />
      <HomeHeroExpress />
      <HomeTrustLine />
      <HomeHowInvoiceWorksSection />
      <HomeRecommendationExplainerSection />
      <HomeReorderSimplificationSection />
      <HomeHumanAdvisorSection />
      <HomeTrustTilesSection />
      <HomeWhoSection />
      <HomeProductFinderSection />
      <ServiceAreaPanel />
      <SiteFooter />
    </div>
  );
}
