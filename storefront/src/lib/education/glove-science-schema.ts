import type { GloveScienceArticle } from "@/config/gloveScienceArticles";

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://www.glovecubs.com").replace(/\/$/, "");

export function gloveScienceHubPath(): string {
  return "/glove-science";
}

export function gloveScienceArticlePath(slug: string): string {
  return `/glove-science/${slug}`;
}

export function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export function articleJsonLd(article: GloveScienceArticle) {
  const url = absoluteUrl(gloveScienceArticlePath(article.slug));
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    dateModified: article.updatedAt,
    datePublished: article.updatedAt,
    keywords: article.keywords.join(", "),
    author: { "@type": "Organization", name: "GloveCubs" },
    publisher: { "@type": "Organization", name: "GloveCubs" },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
