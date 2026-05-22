import { ProcurementSectionShell } from "@/components/procurement";
import { EducationSectionIntro } from "@/components/education/EducationSectionIntro";
import { ScienceFinderWizard } from "@/components/glove-science/finder/ScienceFinderWizard";
import { GLOVE_SCIENCE_FINDER_SECTION } from "@/config/gloveScienceHub";

export function ScienceFinderSection() {
  const section = GLOVE_SCIENCE_FINDER_SECTION;

  return (
    <ProcurementSectionShell
      id={section.sectionId}
      tone="light"
      borderTop
      headingId="glove-science-finder-heading"
      ariaLabel="Find the right glove profile"
      className="scroll-mt-24 !bg-white !py-14 sm:!py-16 lg:!py-20"
      containerClassName="max-w-proc"
    >
      <EducationSectionIntro
        eyebrow="Class-level guidance"
        title={section.title}
        description={section.subtitle}
        headingId="glove-science-finder-heading"
      />
      <ScienceFinderWizard />
    </ProcurementSectionShell>
  );
}
