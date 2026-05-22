import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { ScienceArticleBody } from "@/components/glove-science/articles/ScienceArticleBody";
import { ScienceArticleLayout } from "@/components/glove-science/articles/ScienceArticleLayout";
import {
  getPublishedGloveScienceArticleBySlug,
  getPublishedGloveScienceArticles,
} from "@/config/gloveScienceArticles";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  gloveScienceArticlePath,
  gloveScienceHubPath,
} from "@/lib/education/glove-science-schema";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getPublishedGloveScienceArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getPublishedGloveScienceArticleBySlug(slug);
  if (!article) return { title: "Article | GloveCubs" };

  const path = gloveScienceArticlePath(article.slug);

  return {
    title: `${article.title} | GloveCubs`,
    description: article.description,
    keywords: article.keywords,
    alternates: { canonical: path },
    openGraph: {
      title: article.title,
      description: article.description,
      type: "article",
      url: path,
    },
    robots: { index: true, follow: true },
  };
}

export default async function GloveScienceArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getPublishedGloveScienceArticleBySlug(slug);
  if (!article) notFound();

  const breadcrumbs = breadcrumbJsonLd([
    { name: "Glove science", path: gloveScienceHubPath() },
    { name: article.title, path: gloveScienceArticlePath(article.slug) },
  ]);
  const articleLd = articleJsonLd(article);

  return (
    <div className="home-authority flex min-h-screen min-w-0 flex-col font-poppins">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <SiteHeaderLoader />
      <main className="min-w-0 flex-1 bg-white">
        <ScienceArticleLayout article={article}>
          <ScienceArticleBody sections={article.sections} />
        </ScienceArticleLayout>
      </main>
      <SiteFooter />
    </div>
  );
}
