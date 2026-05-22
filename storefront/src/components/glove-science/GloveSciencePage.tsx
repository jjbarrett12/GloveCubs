import { ScienceDecodeSection } from "@/components/glove-science/sections/ScienceDecodeSection";
import { ScienceFinderSection } from "@/components/glove-science/sections/ScienceFinderSection";
import { ScienceGuidesSection } from "@/components/glove-science/sections/ScienceGuidesSection";
import { ScienceHeroSection } from "@/components/glove-science/sections/ScienceHeroSection";
import { ScienceLibrarySection } from "@/components/glove-science/sections/ScienceLibrarySection";
import { ScienceMythsSection } from "@/components/glove-science/sections/ScienceMythsSection";
import { ScienceOptimizeSection } from "@/components/glove-science/sections/ScienceOptimizeSection";
import { ScienceRiskSection } from "@/components/glove-science/sections/ScienceRiskSection";

export function GloveSciencePage() {
  return (
    <main data-ui-root="glove-science" className="min-w-0 flex-1 bg-white">
      <ScienceHeroSection />
      <ScienceRiskSection />
      <ScienceDecodeSection />
      <ScienceMythsSection />
      <ScienceGuidesSection />
      <ScienceFinderSection />
      <ScienceOptimizeSection />
      <ScienceLibrarySection />
    </main>
  );
}
