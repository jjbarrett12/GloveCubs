import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import type { GloveScienceArticle } from "@/config/gloveScienceArticles";
import { getPublishedGloveScienceArticleBySlug } from "@/config/gloveScienceArticles";
import { SCIENCE_DISCLAIMER } from "@/config/gloveScienceLab";

type ScienceArticleLayoutProps = {
  article: GloveScienceArticle;
  children: ReactNode;
};

export function ScienceArticleLayout({ article, children }: ScienceArticleLayoutProps) {
  const related = (article.relatedSlugs ?? [])
    .map((slug) => getPublishedGloveScienceArticleBySlug(slug))
    .filter((a): a is GloveScienceArticle => Boolean(a));

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <nav className="mb-8 text-sm" aria-label="Breadcrumb">
        <Link
          href="/glove-science"
          className="inline-flex items-center gap-1.5 font-semibold text-neutral-600 transition hover:text-[var(--color-accent-orange)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Glove science
        </Link>
      </nav>

      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-accent-orange)]">
        {article.eyebrow}
      </p>
      <h1 className="proc-display-light mt-3 text-[2rem] sm:text-[2.35rem]">{article.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-neutral-600">{article.description}</p>
      <p className="mt-3 text-sm text-neutral-500">
        Updated {article.updatedAt} · {article.readingTime}
      </p>

      <div className="mt-10">{children}</div>

      {related.length > 0 ? (
        <aside className="mt-12 border-t border-[#ebebea] pt-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">Related guides</p>
          <ul className="mt-4 space-y-2">
            {related.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/glove-science/${item.slug}`}
                  className="text-sm font-semibold text-[var(--color-accent-orange)] hover:underline"
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <div className="mt-12 rounded-2xl border border-[#ebebea] bg-[#fafaf8] p-6 sm:p-8">
        <h2 className="text-lg font-bold text-[#0a0a0a]">Ready to match a glove profile?</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Use our class-level wizard on the glove science hub, or continue to the catalog-backed glove finder.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/glove-science#finder" className="home-cta-primary inline-flex min-h-11 items-center rounded-xl px-6 py-3 text-sm font-bold">
            Glove profile wizard
          </Link>
          <Link
            href="/glove-finder"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d8d8d4] bg-white px-6 py-3 text-sm font-bold text-[#0a0a0a] hover:border-[var(--color-accent-orange)]/40"
          >
            Find matching gloves
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-neutral-500">{SCIENCE_DISCLAIMER}</p>
    </article>
  );
}
