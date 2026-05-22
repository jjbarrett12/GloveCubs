import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { HomeHeroExpress } from "@/components/home/HomeHeroExpress";
import { BrandCarousel } from "@/components/home/BrandCarousel";
import { HomeWhyExistsSection } from "@/components/home/HomeWhyExistsSection";
import { HomeGloveEducationHubWithBridge } from "@/components/home/HomeGloveEducationHub";
import { HomeProcurementMapSection } from "@/components/home/HomeProcurementMapSection";
import { HomeNationwideServiceSection } from "@/components/home/HomeNationwideServiceSection";
import { HomeIndustrySolutionsSection } from "@/components/home/HomeIndustrySolutionsSection";
import { HomeScienceOfGlovesSection } from "@/components/home/HomeScienceOfGlovesSection";
import { HomeFaqSection } from "@/components/home/HomeFaqSection";
import { HomeFinalCtaStrip } from "@/components/home/HomeFinalCtaStrip";
import { HomeBridge } from "@/components/home/authority/HomeAuthorityPrimitives";

/** Authority homepage — procurement-first; no catalog strip on landing. */
export const dynamic = "force-dynamic";

/**
 * Homepage Authority Redesign V1.1 — cohesive procurement brand experience.
 */
export default function HomePage() {
  return (
    <div
      data-ui-root="homepage"
      className="home-authority flex min-h-screen min-w-0 flex-col font-poppins"
    >
      <SiteHeaderLoader />
      <main>
        <HomeHeroExpress />
        <section
          className="border-b border-[#ebebea] bg-white py-6 sm:py-8"
          aria-label="Authorized distributor brands"
        >
          <BrandCarousel compact />
        </section>
        <HomeWhyExistsSection />
        <HomeGloveEducationHubWithBridge />
        <HomeProcurementMapSection />
        <HomeIndustrySolutionsSection />
        <HomeScienceOfGlovesSection />
        <HomeBridge variant="to-light" />
        <HomeFaqSection />
        <HomeNationwideServiceSection />
        <HomeFinalCtaStrip />
      </main>
      <SiteFooter />
    </div>
  );
}
