import type { MetadataRoute } from "next";

/**
 * Crawl controls for the Next storefront (www). Do not rely on Express `public/robots.txt`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/account",
          "/account/",
          "/workspace",
          "/workspace/",
          "/api",
          "/api/",
          "/login",
          "/signup",
          "/auth/",
        ],
      },
    ],
  };
}
