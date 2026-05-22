import { ProcurementSectionShell } from "@/components/procurement";
import { EducationCard } from "@/components/education/EducationCard";
import { EducationSectionIntro } from "@/components/education/EducationSectionIntro";
import { GLOVE_SCIENCE_RISK_CARDS, GLOVE_SCIENCE_RISK_SECTION } from "@/config/gloveScienceHub";

export function ScienceRiskSection() {
  const section = GLOVE_SCIENCE_RISK_SECTION;

  return (
    <ProcurementSectionShell
      id={section.sectionId}
      tone="light"
      borderTop={false}
      headingId="glove-science-risk-heading"
      ariaLabel="Choose gloves by risk environment"
      className="scroll-mt-24 !border-t-0 !bg-white !py-14 sm:!py-16 lg:!py-20"
      containerClassName="max-w-proc"
    >
      <EducationSectionIntro
        eyebrow="Start here"
        title={section.title}
        description={section.subtitle}
        headingId="glove-science-risk-heading"
      />
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {GLOVE_SCIENCE_RISK_CARDS.map((card) => (
          <li key={card.id}>
            <EducationCard
              title={card.title}
              description={card.description}
              href={card.href}
              icon={card.Icon}
            />
          </li>
        ))}
      </ul>
    </ProcurementSectionShell>
  );
}
