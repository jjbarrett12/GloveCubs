import { SiteHeader } from "@/components/home/SiteHeader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { HomeHeroExpress } from "@/components/home/HomeHeroExpress";
import { HomeTrustLine } from "@/components/home/HomeTrustLine";
import { HomeWhoSection } from "@/components/home/HomeWhoSection";
import { HomeProductFinderSection } from "@/components/home/HomeProductFinderSection";
import { HomeTrustTilesSection } from "@/components/home/HomeTrustTilesSection";
import { ServiceAreaPanel } from "@/components/home/ServiceAreaPanel";

/**
 * Homepage order matches public/js/app.js renderHomePage() (Express source of truth).
 */
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a] font-poppins">
      <SiteHeader />
      <HomeHeroExpress />
      <HomeTrustLine />
      <HomeWhoSection />
      <HomeProductFinderSection />
      <HomeTrustTilesSection />
      <ServiceAreaPanel />
      <SiteFooter />
    </div>
  );
}
