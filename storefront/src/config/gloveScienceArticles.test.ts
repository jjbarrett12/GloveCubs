import { describe, expect, it } from "vitest";
import {
  GLOVE_SCIENCE_ARTICLES,
  getPublishedGloveScienceArticleBySlug,
  getPublishedGloveScienceArticles,
} from "./gloveScienceArticles";

describe("gloveScienceArticles", () => {
  it("publishes exactly three v1 articles", () => {
    const published = getPublishedGloveScienceArticles();
    expect(published).toHaveLength(3);
    expect(published.map((a) => a.slug).sort()).toEqual(
      ["ansi-cut-resistance-explained", "nitrile-vs-vinyl-vs-latex", "what-does-mil-mean"].sort()
    );
  });

  it("does not resolve unpublished slugs for routing", () => {
    expect(getPublishedGloveScienceArticleBySlug("why-gloves-fail")).toBeUndefined();
    expect(getPublishedGloveScienceArticleBySlug("what-does-mil-mean")?.published).toBe(true);
  });

  it("keeps unpublished entries in config without published flag", () => {
    const draft = GLOVE_SCIENCE_ARTICLES.filter((a) => !a.published);
    expect(draft.length).toBeGreaterThan(0);
    expect(draft.every((a) => a.published === false)).toBe(true);
  });
});
