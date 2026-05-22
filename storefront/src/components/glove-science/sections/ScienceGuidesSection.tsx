import { ProcurementSectionShell } from "@/components/procurement";
import { EducationSectionIntro } from "@/components/education/EducationSectionIntro";
import { GLOVE_SCIENCE_GUIDES_SECTION } from "@/config/gloveScienceHub";
import {
  DISP_THICKNESS_GUIDE,
  REUSE_CUT_GUIDE,
  SCIENCE_PERF_FOOTNOTE,
  type DispThickness,
} from "@/config/gloveScienceLab";

type GuideRow = {
  label: string;
  bestFor: string;
  caution: string;
};

function milEntry(mil: DispThickness) {
  const row = DISP_THICKNESS_GUIDE.find((g) => g.mil === mil);
  if (!row) throw new Error(`Missing DISP_THICKNESS_GUIDE entry for ${mil} mil`);
  return row;
}

/** Display-only buckets — sourced from DISP_THICKNESS_GUIDE, not independent mil truth. */
function buildDisposableThicknessRows(): GuideRow[] {
  const m3 = milEntry(3);
  const m4 = milEntry(4);
  const m5 = milEntry(5);
  const m6 = milEntry(6);
  const m8 = milEntry(8);

  return [
    {
      label: "2–3 mil",
      bestFor: "Light-duty, short tasks, high dexterity — " + `${m3.duty.toLowerCase()}, ${m3.tagline.toLowerCase()}.`,
      caution: "Thin barriers fail faster on abrasion or long wear; not a default for chemical-heavy work.",
    },
    {
      label: "4–5 mil",
      bestFor:
        "Everyday balance for food, cleaning, and general use — " +
        `${m4.tagline.toLowerCase()} to ${m5.tagline.toLowerCase()}, ${m5.duty.toLowerCase()}.`,
      caution: "Popular program baseline — still match material and certifications to the task.",
    },
    {
      label: "6–7 mil",
      bestFor:
        "More durability and longer wear on tougher tasks — " + `${m6.tagline.toLowerCase()}, ${m6.duty.toLowerCase()}.`,
      caution: "Dexterity drops; avoid standardizing here for precision or high-change work.",
    },
    {
      label: "8+ mil",
      bestFor: "Heavy-duty exposure where barrier time matters — " + `${m8.tagline.toLowerCase()}, ${m8.duty.toLowerCase()}.`,
      caution: "Higher unit cost and hand fatigue; overkill for light, short-contact tasks.",
    },
  ];
}

const CUT_CAUTION: Record<(typeof REUSE_CUT_GUIDE)[number]["level"], string> = {
  A1: "Low cut rating is not “no cut program” — confirm hazard level with your safety team.",
  A2: "Fine for general handling; upgrade when sharps or sheet metal are routine.",
  A3: "Moderate cut exposure — balance cut level with dexterity your line still needs.",
  A4: "Higher cut exposure — verify ANSI rating on the SKU, not color or brand alone.",
  A5: "Maximum cut orientation — expect dexterity tradeoffs; confirm task need before standardizing.",
};

function buildCutRows(): GuideRow[] {
  return REUSE_CUT_GUIDE.map((row) => ({
    label: `${row.level} · ${row.grams}`,
    bestFor: row.taskFit,
    caution: CUT_CAUTION[row.level],
  }));
}

function GuideBlock({ title, rows }: { title: string; rows: GuideRow[] }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#ebebea] bg-white p-6 shadow-[0_8px_30px_rgb(0_0_0/0.04)] sm:p-8">
      <h3 className="text-lg font-bold tracking-tight text-[#0a0a0a]">{title}</h3>
      <ul className="mt-6 space-y-5">
        {rows.map((row) => (
          <li key={row.label} className="border-t border-[#ebebea] pt-5 first:border-t-0 first:pt-0">
            <p className="text-sm font-bold text-[var(--color-accent-orange)]">{row.label}</p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700">
              <span className="font-semibold text-neutral-800">Best for: </span>
              {row.bestFor}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
              <span className="font-semibold text-neutral-700">Buyer caution: </span>
              {row.caution}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScienceGuidesSection() {
  const section = GLOVE_SCIENCE_GUIDES_SECTION;
  const thicknessRows = buildDisposableThicknessRows();
  const cutRows = buildCutRows();

  return (
    <ProcurementSectionShell
      id={section.sectionId}
      tone="light-alt"
      borderTop
      headingId="glove-science-guides-heading"
      ariaLabel="Thickness and cut resistance guides"
      className="scroll-mt-24 !bg-[#f4f4f2] !py-14 sm:!py-16 lg:!py-20"
      containerClassName="max-w-proc"
    >
      <EducationSectionIntro
        eyebrow="Decision tools"
        title={section.title}
        description={section.subtitle}
        headingId="glove-science-guides-heading"
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
        <GuideBlock title="Disposable thickness (mil)" rows={thicknessRows} />
        <GuideBlock title="Reusable cut resistance (ANSI)" rows={cutRows} />
      </div>
      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-neutral-500">{SCIENCE_PERF_FOOTNOTE}</p>
    </ProcurementSectionShell>
  );
}
