import { ProcurementSectionShell } from "@/components/procurement";
import { EducationHotspotLab } from "@/components/education/EducationHotspotLab";
import { EducationSectionIntro } from "@/components/education/EducationSectionIntro";
import {
  DECODE_DEFAULT_HOTSPOT_ID,
  DECODE_HOTSPOTS,
  GLOVE_SCIENCE_DECODE_SECTION,
} from "@/config/gloveScienceHub";
import { SCIENCE_DISCLAIMER } from "@/config/gloveScienceLab";

export function ScienceDecodeSection() {
  const section = GLOVE_SCIENCE_DECODE_SECTION;

  return (
    <ProcurementSectionShell
      id={section.sectionId}
      tone="light-alt"
      borderTop
      headingId="glove-science-decode-heading"
      ariaLabel="Decode glove specifications"
      className="scroll-mt-24 !bg-[#f4f4f2] !py-14 sm:!py-16 lg:!py-20"
      containerClassName="max-w-proc"
    >
      <EducationSectionIntro
        eyebrow="Spec education"
        title={section.title}
        description={section.subtitle}
        headingId="glove-science-decode-heading"
      />
      <EducationHotspotLab hotspots={DECODE_HOTSPOTS} defaultHotspotId={DECODE_DEFAULT_HOTSPOT_ID} />
      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-neutral-500">{SCIENCE_DISCLAIMER}</p>
    </ProcurementSectionShell>
  );
}
