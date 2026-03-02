# SEO Architecture – Clean URLs & Programmatic Pages

This doc describes the SEO-friendly URL structure and how to extend it.

## Clean URL structure

### Product pages
- **Category listing:** `/gloves/` or `/gloves/nitrile/`, `/gloves/vinyl/`, `/gloves/disposable-gloves/`, `/gloves/work-gloves/` (display title: Reusable Work Gloves)
- **Product:** `/gloves/nitrile/black-nitrile-exam-gloves/`
- **Programmatic size pages:** `/gloves/nitrile/black-nitrile-exam-gloves/size/xl/`

Slug is derived from the product name (e.g. "Black Nitrile Exam Gloves" → `black-nitrile-exam-gloves`). Optional `slug` field on a product overrides this.

### Industry landing pages
- `/industries/janitorial/`
- `/industries/foodservice/`
- `/industries/medical/`
- `/industries/healthcare/`
- `/industries/food-processing/`
- `/industries/manufacturing/`
- `/industries/automotive/`

Each industry page has a unique title, description, and filtered product grid. Great for long-tail and “gloves for [industry]” queries.

## APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /api/products/by-slug?slug=...&category=...` | Resolve product by URL slug (optional category to disambiguate). |
| `GET /api/seo/industries` | List of industry slugs and meta. |
| `GET /api/seo/industry/:slug` | Industry meta + products for that industry. |
| `GET /api/seo/sitemap-urls` | All SEO URLs (home, gloves, categories, industries, products, size pages). Use to build `sitemap.xml`. |

## Adding industries

Edit `SEO_INDUSTRIES` in `server.js`:

```js
const SEO_INDUSTRIES = [
  { slug: 'janitorial', title: '...', useCase: 'Janitorial', description: '...' },
  // Add: { slug: 'your-industry', title: '...', useCase: 'Use Case', description: '...' },
];
```

`useCase` must match how products are tagged (name/description/useCase/industry). The industry filter in `GET /api/seo/industry/:slug` already handles Healthcare, Food Service, Food Processing, Janitorial, Manufacturing, Automotive; add more branches there if you add new use cases.

## Programmatic “Black nitrile gloves size XL” pages

- Each product with sizes gets a **Shop by size** line on its detail page (e.g. `XL | L | M`) linking to `/gloves/.../product-slug/size/xl/`.
- Those URLs open the same product with that size pre-selected and a unique title/description (e.g. “Black Nitrile Exam Gloves Size XL | Glovecubs”), which helps for queries like “black nitrile gloves size XL”.

## Sitemap

- **URL list:** `GET /api/seo/sitemap-urls` returns `{ pages: [{ url, priority, changefreq }] }`.
- You can build a static or on-the-fly `sitemap.xml` from this (e.g. cron or serverless function that hits the API and writes XML).
- Ensure your hosting serves `index.html` for all these paths (already set up so the SPA loads and client-side routing runs).

## Best practices

1. **Internal links:** Use the clean URLs (e.g. `/gloves/nitrile/...`, `/industries/janitorial/`) in nav, footers, and cards so crawlers and users see consistent URLs.
2. **Canonical:** The app updates `<title>` and meta description on product and industry pages; consider adding `<link rel="canonical" href="...">` for each page if you need stronger canonical signals.
3. **More industries:** Add more entries to `SEO_INDUSTRIES` and the industry filter logic to capture more “gloves for [industry]” traffic.
