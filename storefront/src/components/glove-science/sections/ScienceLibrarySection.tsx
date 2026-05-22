import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import { EducationSectionIntro } from "@/components/education/EducationSectionIntro";
import { GLOVE_SCIENCE_LIBRARY_SECTION } from "@/config/gloveScienceHub";
import { GLOVE_SCIENCE_ARTICLES, getPublishedGloveScienceArticles } from "@/config/gloveScienceArticles";

export function ScienceLibrarySection() {
  const section = GLOVE_SCIENCE_LIBRARY_SECTION;
  const published = getPublishedGloveScienceArticles();
  const upcoming = GLOVE_SCIENCE_ARTICLES.filter((a) => !a.published);

  return (
    <ProcurementSectionShell
      id={section.sectionId}
      tone="light-alt"
      borderTop
      headingId="glove-science-library-heading"
      ariaLabel="Glove science article library"
      className="scroll-mt-24 !bg-[#f4f4f2] !py-14 sm:!py-16 lg:!py-20"
      containerClassName="max-w-proc"
    >
      <EducationSectionIntro
        eyebrow="Science library"
        title={section.title}
        description={section.subtitle}
        headingId="glove-science-library-heading"
      />

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {published.map((article) => (
          <li key={article.slug}>
            <Link
              href={`/glove-science/${article.slug}`}
              className="group flex h-full flex-col rounded-2xl border border-[#ebebea] bg-white p-6 shadow-[0_8px_30px_rgb(0_0_0/0.04)] transition hover:-translate-y-0.5 hover:border-[var(--color-accent-orange)]/30 hover:shadow-[0_14px_40px_rgb(0_0_0/0.08)]"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)]">
                {article.eyebrow}
              </p>
              <h3 className="mt-2 text-lg font-bold leading-snug text-[#0a0a0a] group-hover:text-[var(--color-accent-orange)]">
                {article.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-600">{article.description}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-accent-orange)]">
                Read guide
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
        {upcoming.map((article) => (
          <li key={article.slug}>
            <div className="flex h-full flex-col rounded-2xl border border-dashed border-[#d8d8d4] bg-white/60 p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-400">{article.eyebrow}</p>
              <h3 className="mt-2 text-lg font-bold leading-snug text-neutral-500">{article.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-500">{article.description}</p>
              <span className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Coming soon</span>
            </div>
          </li>
        ))}
      </ul>
    </ProcurementSectionShell>
  );
}
