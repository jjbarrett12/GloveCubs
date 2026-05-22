import { ProcurementSectionShell } from "@/components/procurement";
import { EducationMythCard } from "@/components/education/EducationMythCard";
import { EducationSectionIntro } from "@/components/education/EducationSectionIntro";
import { GLOVE_SCIENCE_MYTHS, GLOVE_SCIENCE_MYTHS_SECTION } from "@/config/gloveScienceHub";

export function ScienceMythsSection() {
  const section = GLOVE_SCIENCE_MYTHS_SECTION;

  return (
    <ProcurementSectionShell
      id={section.sectionId}
      tone="light"
      borderTop
      headingId="glove-science-myths-heading"
      ariaLabel="Common glove buying mistakes"
      className="scroll-mt-24 !bg-white !py-14 sm:!py-16 lg:!py-20"
      containerClassName="max-w-proc"
    >
      <EducationSectionIntro
        eyebrow="Buyer myths"
        title={section.title}
        description={section.subtitle}
        headingId="glove-science-myths-heading"
      />
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {GLOVE_SCIENCE_MYTHS.map((item) => (
          <li key={item.id}>
            <EducationMythCard {...item} />
          </li>
        ))}
      </ul>
    </ProcurementSectionShell>
  );
}
