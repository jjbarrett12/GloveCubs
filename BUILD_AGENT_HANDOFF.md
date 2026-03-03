# Build Agent Handoff — GloveCubs

**Purpose:** Upload this file (or paste its contents) into a new Cursor Build agent after migrating the project folder (e.g. from OneDrive to C:). It gives the agent full context so nothing valuable is lost.

---

## 1. Project identity

- **Name:** GloveCubs  
- **What it is:** B2B e‑commerce platform for disposable and reusable work gloves (and related PPE).  
- **Primary stack:** **Express.js** backend + **vanilla JavaScript SPA** (no Next.js in the main app).  
  - Frontend: `public/js/app.js`, `public/css/styles.css`, `public/index.html`.  
  - Backend: `server.js`, `lib/*.js`.  
  - Optional: A **Next.js storefront** may exist in a subfolder (e.g. `storefront/`) for industry landing pages; the main app is still Express + vanilla JS.

---

## 2. Repo layout (main app)

| Path | Role |
|------|------|
| `server.js` | Express server: API routes, auth, CSV import/export, admin, AI endpoints, product URL parsing. |
| `public/js/app.js` | SPA: routing (`navigate()`), pages, admin UI, product finder, industry landing HTML builder, glove-finder & invoice-savings UI. |
| `public/css/styles.css` | Global styles. |
| `public/index.html` | Single HTML entry; `data-theme` set to `light` for public pages. |
| `lib/*.js` | Server-side: Supabase client, CSV import to Supabase, product store (CSV parse/export), pricing, parse-product-url, hospeco/globalglove extractors, image validation, AI provider, AI schemas, AI log. |
| `src/config/industries.ts` | **Existing** industry config (TypeScript): slugs `medical | janitorial | food-service | industrial | automotive`; used by main SPA for industry pages and product filters. |
| `database.json` | JSON-file DB when Supabase is not used (products, users, etc.). |
| `loadDB()` / `saveDB()` | In-memory `db` load/save for JSON path. |
| `.env` | Supabase, JWT, AI keys, etc. Never commit secrets. |

---

## 3. Data & auth

- **Database:** Prefer **Supabase** (Postgres) when configured (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Fallback: `database.json` + `loadDB()`/`saveDB()`.
- **Auth:** JWT; `authenticateToken` middleware; admin gated by `is_approved` (or equivalent). `requireAdmin` for admin-only routes.
- **Tables (Supabase):** `products`, `manufacturers`, `companies`, `company_members`, `customer_manufacturer_pricing`, `ai_conversations`, `invoice_uploads`, `invoice_lines`, `recommendations`. Migrations live in `supabase/migrations/`.

---

## 4. Features implemented (summary)

- **Dark/light mode:** Theme toggle only on backend/portal pages; public homepage is light-only.
- **“Reusable Work Gloves” rename:** User-facing copy and SEO updated; internal filter keys/routes unchanged (e.g. `work-gloves`).
- **CSV import (Supabase as source of truth):**  
  - Upsert by SKU; row-fault tolerant; `image_url` optional; auto-sync `manufacturers` and backfill `products.manufacturer_id`.  
  - Response: `parsedRows`, `created`, `updated`, `failed`, `skipped`, `errorSamples`.  
  - Admin UI: “Import Results” modal with counts and error samples; no green check if `failed > 0`.
- **CSV export:** Round-trip safe with importer; min columns: `sku`, `name`, `brand`, `cost`, `image_url`, `manufacturer_id`, `manufacturer_name`; idempotent re-import.
- **Admin customer pricing:** Default gross margin per company; manufacturer overrides; `lib/pricing.js` (`getEffectiveMargin`, `computeSellPrice`); Admin → Customers UI; API: companies, default-margin, overrides CRUD.
- **Add Product by URL:**  
  - `POST /api/admin/products/parse-url` (asset vs page; HEAD/GET; timeout/retry).  
  - Domain adapters: Hospeco (SKU + GetImage.ashx), Global Glove.  
  - `POST /api/admin/products/ai-normalize`, `validate-images`, `save`; image URLs kept even if unverified.  
  - UI in admin: URL input, asset vs page flow, product page URL when asset.
- **AI layer:**  
  - Provider-agnostic `lib/ai/provider.js` (OpenAI implemented; Gemini stubbed).  
  - Endpoints: `POST /api/ai/glove-finder`, `POST /api/ai/invoice/extract`, `POST /api/ai/invoice/recommend`.  
  - Zod schemas in `lib/ai/schemas.js`; rate limiting; Supabase logging (summaries only).  
  - Pages: `/glove-finder`, `/invoice-savings` in the SPA.
- **Industry landing (main SPA):** Industry pages rendered from `src/config/industries.ts` via `buildIndustryLandingHTML()` and routing (e.g. `/industries/medical`). Homepage industry cards link to these.

---

## 5. Store & filtering conventions

- **Store base path:** `/store` (or equivalent in SPA).  
- **Filtering:** Query params drive filters.  
  - `industry=<key>` (e.g. `janitorial`, `restaurants`, `healthcare`, `industrial`).  
  - `category=<slug>`, `collection=<slug>` as needed.  
- **Links:** Industry “Shop {Industry}” and collection cards should point to e.g. `/store?industry=janitorial&category=nitrile-gloves`.  
- If the store page or API does not yet apply these params, the links are still correct; wire filtering later in the store logic.

---

## 6. Optional Next.js storefront (industry pages)

If a **Next.js** app exists (e.g. in `storefront/`):

- **Stack:** Next.js App Router, TypeScript, Tailwind, shadcn-style components (Button, Card, Badge, Tabs, Accordion, Separator, Dialog, Input).
- **Config:** `storefront/src/config/industries.ts` — type `IndustryKey = "janitorial" | "restaurants" | "healthcare" | "industrial"` and `INDUSTRIES` with: `name`, `tagline`, `subtagline`, `heroBullets`, `proofStats`, `featuredCollections` (6), `topCategories` (8), `useCases` (4), `faq` (6), `complianceNotes?`, `primaryGradientClass`, `accentClass`.
- **Template:** `IndustryLandingTemplate.tsx` — hero, proof strip, featured collections, “Buy the way your team buys”, top categories, use cases, FAQ accordion, bottom CTA. Dark-mode first; premium spacing; `rounded-2xl`; max-width `max-w-6xl`/`max-w-7xl`.
- **Routes:** `/industries/janitorial`, `/industries/restaurants`, `/industries/healthcare`, `/industries/industrial` (explicit or dynamic `[industryKey]`). Invalid key → `notFound()`.
- **CTAs:** “Shop {Industry}” → `/store?industry=<key>`; “Build a Quicklist” → `/account/quicklists` or `/login` (auth gating can be TODO). Collection cards → `/store` with appropriate `industry` + `category`/`collection` params.

---

## 7. Pending / follow-up work

- **Footer links:** Single source of truth for footer links and brand logos (e.g. `public/js/footerLinks.js` or `src/lib/footerLinks.ts`); ensure every link is valid and clickable (internal or external). Not fully done.
- **Product images table:** Optional `product_images` with `verified` and `sort_order` for “Add Product by URL”; primary image still on `products.image_url`. Not implemented.
- **Gemini AI provider:** `lib/ai/provider.js` has OpenAI; Gemini is stubbed. Implement when needed.
- **Auth gating:** Quicklist and other account links may still be TODO for “if not authed, send to /login”.

---

## 8. Environment & run

- **Env:** Copy `.env.example` to `.env`; set Supabase, JWT, and optionally `OPENAI_API_KEY`, `AI_PROVIDER`, etc. Never commit `.env`.
- **Main app:** `npm install` then `npm run dev` or `node server.js` (port e.g. 3001 or 3004).
- **Storefront (if present):** `cd storefront && npm install && npm run dev` (often port 3000).

---

## 9. Lint & quality

- Run the project’s linter/build (e.g. `npm run build` in storefront if applicable).
- Main app: no separate build step; ensure `node server.js` starts and key routes respond.

---

## 10. Security reminder

- Never commit `.env` or real API keys/passwords.  
- Supabase service role key is server-side only.  
- Use env vars for all secrets; document only variable names in `.env.example`.

---

## 11. Design / UX context and gotchas

- **Brand:** Primary orange `#FF7A00` (CSS var `--primary`). Dark surfaces use `#1a1e26`, `#0d0f12`, etc.
- **Category rename:** User-facing label is **“Reusable Work Gloves”**; internal value and API still use **“Work Gloves”**. `getCategoryDisplayName(category)` in `public/js/app.js` (top of file) maps for display. Use it anywhere you show category text (breadcrumbs, filters, H1s).
- **Footer:** Single source of truth is `public/js/footerLinks.js` (FOOTER_LINKS: quickLinks, topBrands, contactLinks, socialLinks). `initFooter()` in `public/js/app.js` injects HTML into `#footerContainer`. Don’t change link destinations in the handoff; styling is in `public/css/styles.css` under `.footer` and `.hero-procurement` footer rules.
- **Homepage hero — critical:** Two hero implementations exist:
  - **Actually rendered:** In `renderHomePage()` in `public/js/app.js` (around **line 754**), the hero section has class **`hero-new home-hero-dark`** and **inline styles** (e.g. `padding: 24px 0 60px`). This is what the browser shows.
  - **Design-system version:** CSS and design docs reference **`.hero-procurement`** and a structure with `.hero-bg-base`, `.hero-cta-primary`, etc. That markup is **not** currently in use. The live hero is the older block with inline padding and gradient.
  - **To change hero spacing or layout:** Edit the **inline style** on the `<section class="hero-new home-hero-dark">` in `app.js` (e.g. `padding: 24px 0 60px`) and/or add the procurement classes to that section and container if you want the procurement CSS to apply.
- **Login / Register:** Dark-themed by default. All auth-page styling is scoped under **`.auth-page`** in `public/css/styles.css`. No `hero-procurement` or `data-theme` needed; the auth section is always dark (gradient background, dark card, orange accents).
- **Theme (dark/light):** Public homepage is light-only. Theme toggle is shown only when the user is logged in (`theme-toggle-auth-only` class; `updateHeaderAccount()` in app.js). After logout, `data-theme` is forced back to `light`.

---

## 12. Design doc index (docs/)

| File | Purpose |
|------|--------|
| `DESIGN-HERO-PROCUREMENT.md` | Hero layout, CTAs, operator badges, builder panel, AI snapshot — design tokens and hierarchy. |
| `DESIGN-FOOTER.md` | Footer link styling, brand chips, social buttons, logo area. |
| `DESIGN-CATEGORY-RENAME.md` | “Reusable Work Gloves” copy and layout (footer, sidebar, H1, breadcrumb). |
| `INDUSTRY-LANDING-DESIGN-SYSTEM.md` | Industry landing wireframes and per-industry skins (if using industry pages). |

---

*End of handoff. Give this file (or its contents) to the new Build agent when continuing work after migrating the folder.*
