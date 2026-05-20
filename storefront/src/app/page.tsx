import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { HomeHeroExpress } from "@/components/home/HomeHeroExpress";
import { HomeWhyExistsSection } from "@/components/home/HomeWhyExistsSection";
import { HomeGloveEducationHubWithBridge } from "@/components/home/HomeGloveEducationHub";
import { HomeProcurementMapSection } from "@/components/home/HomeProcurementMapSection";
import { HomeNationwideServiceSection } from "@/components/home/HomeNationwideServiceSection";
import { HomeIndustrySolutionsSection } from "@/components/home/HomeIndustrySolutionsSection";
import { HomeScienceOfGlovesSection } from "@/components/home/HomeScienceOfGlovesSection";
import { HomeAiProcurementSection } from "@/components/home/HomeAiProcurementSection";
import { HomeOperationalTrustSection } from "@/components/home/HomeOperationalTrustSection";
import { HomeFaqSection } from "@/components/home/HomeFaqSection";
import { HomeFinalCtaStrip } from "@/components/home/HomeFinalCtaStrip";

/** Authority homepage — procurement-first; no catalog strip on landing. */
export const dynamic = "force-dynamic";

/**
 * Homepage Authority Redesign V1.1 — cohesive procurement brand experience.
 */
export default function HomePage() {
  return (
    <div className="home-authority flex min-h-screen min-w-0 flex-col font-poppins">
      <SiteHeaderLoader />
      <main>
        <HomeHeroExpress />
        <HomeWhyExistsSection />
        <HomeGloveEducationHubWithBridge />
        <HomeProcurementMapSection />
        <HomeNationwideServiceSection />
        <HomeIndustrySolutionsSection />
        <HomeScienceOfGlovesSection />
        <HomeAiProcurementSection />
        <HomeOperationalTrustSection />
        <HomeFaqSection />
        <HomeFinalCtaStrip />
      </main>
      <SiteFooter />
    </div>
  );
}
