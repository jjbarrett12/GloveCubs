import type { GloveScienceArticleSection } from "@/config/gloveScienceArticles";

export function ScienceArticleBody({ sections }: { sections: GloveScienceArticleSection[] }) {
  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <section key={section.heading}>
          <h2 className="text-xl font-bold tracking-tight text-[#0a0a0a] sm:text-2xl">{section.heading}</h2>
          {section.paragraphs.map((paragraph, index) => (
            <p key={index} className="mt-4 text-[17px] leading-relaxed text-neutral-700">
              {paragraph}
            </p>
          ))}
          {section.bullets ? (
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[17px] leading-relaxed text-neutral-700">
              {section.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {section.callout ? (
            <p className="mt-5 rounded-xl border border-[var(--color-accent-orange)]/20 bg-[#fffaf7] px-4 py-3.5 text-sm leading-relaxed text-neutral-700">
              {section.callout}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
