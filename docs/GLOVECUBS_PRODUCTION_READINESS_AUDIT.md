# GLOVECUBS PRODUCTION READINESS AUDIT

**Audit type:** Full production-readiness (product, engineering, security, UX, commercial, operations)  
**Scope:** Entire GloveCubs codebase — Express main app, vanilla SPA, Next.js storefront, CatalogOS, Supabase, deployment.  
**Method:** Codebase inspection, route/product-flow tracing, schema and auth review. No sugarcoating.

---

## 1. Executive Verdict

### Scores (0–100)

| Area | Score | Notes |
|------|--------|------|
| **Overall production readiness** | **32** | Multiple critical data/auth/security gaps; product and workflows incomplete. |
| **Product readiness** | **28** | Value prop present but thin; no clear first-run outcome; billing/onboarding/activation weak or missing. |
| **Engineering readiness** | **38** | Two product sources of truth; auth in JSON while products can be in Supabase; admin logic bug. |
| **Security readiness** | **35** | Admin gating flawed; JWT secret default; health endpoint exposes env; no CSRF/XSS hardening. |
| **UX/onboarding readiness** | **30** | Hash routing; no email verification; “pending approval” with no timeline; empty states generic. |
| **Commercial readiness** | **25** | No subscription/billing UI; no pricing page; no terms/privacy/cookie flows; trust/FAQ thin. |
| **Operational readiness** | **30** | No runbook; multi-app (Express + 2× Next.js); env and deployment assumptions; observability minimal. |

### Direct answers

- **Is this production ready right now?** **NO.**
- **Is the product itself the main missing piece?** **PARTIALLY.** The main missing piece is the **combination** of: (1) **data and auth consistency** (products read from JSON while writes go to Supabase; admin = any approved user if allowlist empty), (2) **incomplete core workflows** (approval, billing, first meaningful action), and (3) **product clarity and trust** (why pay, what do I get, terms, support). Product depth is weak, but **technical and security gaps would cause immediate production failures** before “product” could even be judged.

### Top 5 blockers preventing launch

1. **Products read from `database.json` while CSV import and admin “Save” write to Supabase** — Store and APIs never read from Supabase products. After CSV import or Add-by-URL save, the store still shows `database.json`; customers see stale or empty catalog. **File:** `server.js` (GET `/api/products`, `/api/products/:id`, `/api/products/by-slug`, `/api/seo/industry/:slug` use `loadDB()` and `db.products` only.)
2. **Admin = any approved B2B user when `app_admins` is empty** — `requireAdmin` passes if `user.is_approved` is truthy when the allowlist has no entries. Every approved customer can access admin routes (companies, manufacturers, inventory, bulk import, etc.). **File:** `server.js` lines 3268–3277.
3. **No single source of truth for users/auth** — Auth is file-based (`database.json`: users, companies, app_admins, password_reset_tokens). Supabase has `companies` and `company_members` migrations but server never uses them for login or admin. Multi-instance or serverless deployments break auth persistence.
4. **CatalogOS and storefront are separate apps** — CatalogOS (port 3010) and storefront (port 3004) are different Next.js apps; main app is Express (3004). No unified deployment story; no single sign-on; no shared “GloveCubs product” for a paying customer.
5. **No billing, terms, or subscription flow** — Stripe exists for one-time payment intents only. No pricing page, no “choose plan,” no terms of service, no privacy policy, no cookie consent. Commercially and legally not launchable.

---

## 2. What GLOVECUBS Appears To Be

| Aspect | What the codebase shows |
|--------|--------------------------|
| **Target customer** | B2B buyers (companies) needing disposable and reusable work gloves in bulk; industries: medical, janitorial, food-service, industrial, automotive. |
| **Primary use case** | Browse catalog → request quote / create RFQ; optional cart and checkout with Stripe; “AI” glove finder and invoice savings (upload invoice, get recommendations). |
| **Key workflows** | (1) Anonymous browse and industry landing pages, (2) Register → “pending approval,” (3) Login → shop, cart, checkout or RFQ, (4) Admin: orders, users, companies, pricing, CSV import, Add Product by URL, bulk import, Fishbowl, email routing. |
| **Core differentiators** | Industry-focused landing pages; AI glove finder; invoice upload for savings; B2B pricing by company; net terms and “dedicated rep” messaging. |
| **Monetizable value** | Margin on product sales; B2B pricing and tiers (bronze/silver/gold/platinum); implied net terms and volume discounts. |
| **Problem it solves** | One-stop B2B glove sourcing with industry fit, bulk pricing, and (theoretical) AI-assisted selection and cost reduction. |

**Positioning clarity:** Messaging exists (B2B, industries, bulk, net terms, AI) but is **muddy** in execution: no clear “first win” (e.g. get a quote in 60 seconds), no visible pricing, and no post-signup path that clearly delivers value. The product feels like a **catalog + quote request + checkout** with AI and admin tooling bolted on, not a single coherent “GloveCubs experience.”

---

## 3. Product Completeness Audit

| Area | Status | Evidence |
|------|--------|----------|
| **Value proposition clarity** | WARN | Hero and copy say “B2B,” “bulk,” “net terms,” “1,000+ SKUs” — but no single headline that states “what you get” in one sentence. |
| **Homepage clarity** | WARN | Hero + industry blocks + product grid; CTAs “Request Quote” and “AI Recommender”; no clear primary action. |
| **CTA clarity** | FAIL | Multiple CTAs (Request Quote, AI Recommender, Shop, Upload Invoice) with no hierarchy; “Request Quote” does not clearly lead to a defined outcome (e.g. “Quote in 24h”). |
| **Onboarding flow** | FAIL | Register → “Account created! Pending approval” with no timeline, no email verification, no steps to “get approved.” No first-run wizard or setup. |
| **First-run experience** | FAIL | After login, user lands on same browse experience; no “complete your company profile” or “add ship-to” or “request your first quote.” |
| **User activation path** | FAIL | No defined “activated” state (e.g. first quote requested, first order, profile complete). No emails or in-app nudges. |
| **User dashboard usefulness** | WARN | Dashboard shows orders, tier progress, budget, rep — useful for repeat buyers but not for “first value.” |
| **Account setup completeness** | FAIL | Ship-to addresses and saved lists exist; company-level B2B profile (e.g. tax ID, net terms) not exposed in UI. |
| **Feature completeness** | WARN | Cart, checkout, RFQ, glove finder, invoice upload exist but feel isolated; no flow that ties “find glove → get quote → order” into one story. |
| **Can users achieve main promised outcome?** | WARN | “Get B2B pricing and bulk gloves” is achievable only if (1) they get approved (opaque), (2) they use RFQ or cart (no guided path). |
| **Empty state quality** | WARN | Generic “No products” / “Unable to load” with “Try again” or “Browse Products”; no contextual empty states (e.g. “No orders yet — place your first order”). |
| **Error state quality** | WARN | API errors often surfaced as generic messages; no retry/back strategies; 404 and timeout handling basic. |
| **Settings completeness** | FAIL | No user/account settings page (password change, email, notifications). Budget and rep are the only “settings-like” areas. |
| **Profile/account/org management** | FAIL | No profile edit; no org switcher; company data is admin-only. |
| **Billing/subscription readiness** | FAIL | Stripe for one-time payments only; no plans, no subscription, no “Billing” in nav. |
| **Notifications/email flows** | WARN | Contact form and password reset send email; order confirmation and RFQ notifications depend on ADMIN_EMAIL/SMTP; no in-app notification center. |
| **Admin tooling** | PASS | Admin has orders, users, companies, manufacturers, pricing, CSV import, Add by URL, bulk import, Fishbowl, email routing — broad but gated incorrectly (see security). |
| **Reporting/analytics** | FAIL | No reports, no dashboards, no analytics (e.g. conversion, top products). |
| **Search/filtering** | PASS | Product search and filters (category, brand, material, powder, thickness, size, color, grade, use case) exist and work against the current data source. |
| **Mobile responsiveness** | WARN | CSS and layout suggest responsiveness; industry and storefront use Tailwind; main SPA has mobile menu and sticky CTA — NOT VERIFIED on real devices. |
| **Trust signals** | WARN | “Authorized Distributor,” “Distributor pricing,” “Net terms,” “Fast fulfillment,” “Dedicated rep” in utility bar and copy; no trust badges, no testimonials, no security/guarantee copy. |
| **Help/support/contact flows** | WARN | Contact form and FAQ exist; no help center, no chat, no “Contact for approval” path. |
| **Retention loops** | FAIL | No “come back” (e.g. reorder, saved lists reminders, price alerts); no email campaigns beyond transactional. |
| **“Why would I pay for this?”** | FAIL | No public pricing; no “Plans” or “Enterprise”; value is implied (B2B pricing after approval) but not stated. |

**Minimum lovable product?** **No.** Core actions (browse, quote, checkout) exist but are not tied into a single clear journey; approval is a black box; billing and legal are missing. This is a **partial shell** with real features that are not yet a coherent product.

**Missing piece:** Mix of **product depth** (first-run, activation, billing, trust), **product clarity** (one clear outcome and CTA), and **execution quality** (data consistency, auth, and security must be fixed first or the product cannot be safely run in production).

---

## 4. User Journey Audit

| Journey | Grade | What breaks / gaps |
|---------|--------|--------------------|
| **Anonymous visitor landing** | WARN | Homepage loads; industry and shop links work. If products are in Supabase only, catalog is empty and experience is broken. No clear “start here” path. |
| **New signup** | FAIL | Register form works; success says “Pending approval” with no next step, no email verification, no SLA. User does not know when or how they get access. |
| **Email verification** | FAIL | **Not implemented.** No verification link or token; anyone can register with any email. |
| **Login/logout/session persistence** | WARN | JWT in memory/localStorage; 7d expiry; logout clears token. No “remember me” or refresh; session lost on tab close unless token is persisted (NOT VERIFIED where token is stored). |
| **Onboarding/setup** | FAIL | No post-signup onboarding; no “complete profile” or “add first ship-to”; dashboard is the next screen with no guidance. |
| **First meaningful action** | FAIL | Undefined. Could be “request a quote” or “add to cart” but no flow is designed around it; no celebration or next step. |
| **Repeat usage** | WARN | Returning user can browse, cart, checkout, or use RFQ; dashboard shows orders. Works if data source is consistent. |
| **Returning user dashboard** | WARN | Orders, tier, budget, rep; useful. No “recommended for you” or reorder shortcuts. |
| **Admin flow** | FAIL | **Any approved user can access admin** when `app_admins` is empty (see Security). Admin tabs and routes exist but gating is wrong. |
| **Support/help flow** | WARN | Contact and FAQ; no ticket system or status. |
| **Billing/subscription flow** | FAIL | **Not present.** Checkout uses Stripe one-time; no subscription or plan management. |
| **Edge cases and dead ends** | WARN | Reset password works; invalid token shows message. 404 and network errors show generic content. No recovery path for “pending approval” (e.g. “Contact us to expedite”). |

**Would this survive real user traffic?** **No.** Data split (JSON vs Supabase) and admin bypass would cause wrong or empty catalog and privilege escalation. Session and approval UX would confuse and frustrate users.

---

## 5. Frontend/UI Audit

| Area | Assessment |
|------|------------|
| **Visual consistency** | WARN | Orange (#FF7A00) and dark surfaces; Poppins and Font Awesome. Inline styles in `app.js` (hero, industry blocks) mix with CSS; CatalogOS and storefront use Tailwind/shadcn — three UI systems. |
| **Information hierarchy** | WARN | Headers and sections exist; hero vs body vs footer is clear. Dense nav and multiple CTAs dilute focus. |
| **Navigation clarity** | WARN | Shop, Industries, Brands, AI, Bulk/RFQ, Resources, FAQ, Contact, Upload Invoice. Many items; no clear “primary” path. |
| **Responsiveness** | NOT VERIFIED | Media queries and mobile menu present; not tested on devices. |
| **Loading states** | WARN | Some “Loading…” placeholders; product grid and API calls not consistently showing spinners. |
| **Empty states** | WARN | Generic “No products,” “Unable to load,” “Try again”; not contextual. |
| **Form UX** | WARN | Forms present; validation is server-driven; no inline field validation or clear error placement. |
| **Accessibility** | WARN | Some aria-labels (theme toggle); no systematic a11y audit; focus and keyboard flow NOT VERIFIED. |
| **Component reuse** | WARN | Main SPA is one large `app.js` with render functions; storefront and CatalogOS use React components. Little reuse across the three apps. |
| **Design debt** | FAIL | Hero and critical sections use inline styles in JS; two hero implementations (design doc vs actual); footer injected from config. |
| **Trustworthiness/polish** | WARN | Looks like a real site (logo, nav, footer) but no “powered by” or guarantee copy; placeholders (e.g. “GLOVECUBS_API_URL_INJECT”) in HTML. |

**Production software vs dev mockup:** Leans **dev mockup**: multiple UIs, inline styles, no design system, and placeholders. Functional but not polished.

**Unfinished / placeholder:** Hero and CTA blocks in `app.js`; `mainContent` filled by JS (no SSR); API URL injection; no terms/privacy/cookie pages.

---

## 6. Backend / Architecture Audit

| Area | Finding |
|------|--------|
| **App structure** | **Three apps:** (1) Express `server.js` + vanilla SPA `public/`, (2) Next.js `storefront/`, (3) Next.js `catalogos/`. No monorepo or shared package; different ports and deployment assumptions. |
| **Route organization** | Express: 80+ routes in one file; auth, products, admin, AI, cart, orders, RFQ, Fishbowl, etc. No route modules. |
| **API design** | REST-like; mixed response shapes; some Zod (AI), many ad-hoc checks. No OpenAPI or versioning. |
| **Validation** | Partial: AI endpoints use Zod; register/login/contact do basic checks; no request schema layer. |
| **Error handling** | try/catch with 500 and message; no error codes or structured payloads; health endpoint returns 200 with error details. |
| **Logging** | console.log/error; no structured logger or request ID; parse and AI logs can go to file. |
| **Background jobs** | Fishbowl export on interval; bulk import worker via HTTP + secret. No queue (e.g. Bull); no job dashboard. |
| **Env/secrets** | .env and .env.example; JWT_SECRET default in code; Stripe and Supabase keys from env. No secrets manager. |
| **Dependency risk** | Express, Supabase, Stripe, OpenAI, bcrypt, JWT — standard. No lockfile audit. |
| **Dead code** | fishbowl, productStore CSV path when Supabase used; design-system hero not used. |
| **Technical debt** | Single server.js ~3800 lines; loadDB/saveDB used for auth and products while Supabase used for product writes; no migration from JSON to Supabase for reads. |
| **Scalability** | Single process; in-memory db; file writes for JSON. Not horizontal; serverless would need different persistence. |
| **Caching** | None for product list or API responses. |
| **Query efficiency** | Product list filtered in memory; no pagination on GET /api/products (full list). |
| **Idempotency** | CSV import and bulk import have some idempotency (upsert by SKU); orders and auth are not idempotent. |
| **Transactions** | No multi-step transactions; Supabase and file writes are independent. |

**Verdict:** **Prototype-grade.** Works for a single instance and file-based or single DB, but data split, no shared auth/store, and single-file backend prevent it from being **launch-grade**.

---

## 7. Auth / Permissions / Multi-Tenant Risk Audit

| Risk | Severity | Detail |
|------|----------|--------|
| **Admin is any approved user when allowlist empty** | **CRITICAL** | `requireAdmin`: `if (!user.is_approved && !isAllowlisted)` → if `app_admins` is empty, `isAllowlisted` is false, so any approved user passes. **File:** `server.js` 3268–3277. |
| **JWT secret default** | **CRITICAL** | `JWT_SECRET = process.env.JWT_SECRET \|\| 'glovecubs-secret-key-2024'`. If env is unset, tokens are guessable. **File:** `server.js` line 37. |
| **Health endpoint exposes config** | **HIGH** | GET `/api/admin/supabase/health` returns `cwd`, `envFilePath`, `supabaseUrlSet`, `serviceRoleSet` — no auth. Information disclosure. **File:** `server.js` 269–297. |
| **No CSRF protection** | **HIGH** | State-changing endpoints (login, register, contact, cart, orders) use JSON and JWT in header; no CSRF tokens. Cookie-based sessions would need CSRF. |
| **No rate limit on most routes** | **MEDIUM** | Only `/api` (200/15min), auth/contact (20/15min), AI (30/15min). Product and admin routes share the general API limit. |
| **IDOR on orders and resources** | **MEDIUM** | Orders and resources are keyed by id; some checks use `req.user` but not all paths verify “this user’s company.” e.g. GET/PUT `/api/orders/:id` — need to confirm scope. |
| **Supabase service role in server** | **MEDIUM** | Service role used for CSV import, bulk import, product save — correct for server-only; key must stay server-side. |
| **CatalogOS ingest/publish unauthenticated** | **HIGH** | (From prior audit.) POST /api/ingest and POST /api/publish in CatalogOS can be called by anyone unless middleware is enabled; middleware exists but is optional (env-based). |
| **Session storage** | **MEDIUM** | JWT sent in Authorization header; client must store token (localStorage or memory); refresh not implemented. |
| **Password reset token in URL** | **LOW** | Token in query string; sent by email; 1h expiry. Acceptable if email channel is trusted. |
| **Multi-tenant** | **WARN** | Companies and company_members exist in Supabase; server uses `database.json` companies and user.company_name. No tenant isolation in API (e.g. filter orders by company_id). |

**Critical:** Fix admin check (require explicit allowlist or role) and remove JWT default. **High:** Auth health endpoint; CatalogOS API protection; CSRF where cookies are used.

---

## 8. Database / Data Model Audit

| Area | Finding |
|------|--------|
| **Schema quality** | WARN | 35+ migrations; products, manufacturers, companies, company_members, AI tables, CatalogOS, bulk import, email routing, etc. Some duplication (e.g. catalogos vs public catalogos_*). |
| **Missing tables** | WARN | No `sessions` or `refresh_tokens`; no `audit_log` for admin actions; no `plans` or `subscriptions`. |
| **Nullable fields** | WARN | Many optional fields; no systematic “required for launch” list. |
| **Relational integrity** | WARN | FKs in Supabase; `database.json` has no referential integrity. |
| **Support for real workflows** | FAIL | Products read from file; orders and cart may use file (NOT VERIFIED all order paths). Approval workflow has no state machine (e.g. pending/approved/rejected). |
| **Audit logs** | FAIL | No audit table for “who changed what” in admin (e.g. pricing, user approval). |
| **Timestamps** | WARN | created_at/updated_at in many places; not consistent everywhere. |
| **Soft delete** | WARN | Some `is_active` or status; products and users have no soft delete. |
| **Migration quality** | WARN | Idempotent where checked; ordering by filename; no down migrations. |
| **Indexing** | WARN | Some indexes in migrations; no analysis of slow queries. |
| **RLS** | WARN | CatalogOS has RLS; main app uses service role and in-memory auth — no RLS on public.products for “only my org.” |
| **Scale** | FAIL | File-based auth and product read do not scale; no connection pooling or read replicas. |
| **Product vision** | FAIL | Data model does not support “single GloveCubs product”: two product sources (JSON + Supabase), auth in file, CatalogOS separate. |

**Verdict:** Schema is **too thin and split** for the real product: single source of truth for products and users, tenant-aware access, and auditability are missing.

---

## 9. Quality / Testing / Reliability Audit

| Area | Finding |
|------|--------|
| **Unit tests** | WARN | CatalogOS and storefront have Vitest (e.g. normalization, scoring, query, publish); main Express app has no unit tests. |
| **Integration tests** | FAIL | No API or DB integration tests. |
| **E2E tests** | FAIL | Playwright in devDependencies; no e2e suite found in scripts or obvious flow. |
| **Test realism** | WARN | Tests cover logic; no chaos or fixture-based “real” data. |
| **Smoke tests** | FAIL | No smoke or health script that hits critical routes. |
| **Critical-path coverage** | FAIL | Login, register, product list, checkout, admin not covered by automated tests. |
| **Error boundaries** | WARN | React error boundaries in Next apps NOT VERIFIED; main SPA has try/catch in navigate/render. |
| **Monitoring** | FAIL | No APM, no error reporting (e.g. Sentry), no uptime checks. |
| **Observability** | FAIL | No structured logs, no request IDs, no metrics. |
| **Production debug** | WARN | Logs and parse logs help; no correlation ID or debug mode. |
| **Resilience** | WARN | Rate limits and timeouts in places; no circuit breaker or fallback for Supabase/Stripe. |

**Silent failures:** CSV import to Supabase succeeds but store still reads JSON → empty catalog. Admin check passes for wrong users → silent privilege escalation. **Regret:** Launching without fixing the product read path and admin check, and without at least smoke tests for login, product list, and checkout.

---

## 10. Security Audit

| Category | Items |
|----------|--------|
| **Critical** | (1) Admin = any approved user when `app_admins` empty. (2) JWT_SECRET default. (3) Products read from file while writes go to Supabase → data inconsistency and possible bypass. |
| **High** | (1) Health endpoint exposes env/cwd. (2) CatalogOS ingest/publish unauthenticated unless middleware enabled. (3) No CSRF on state-changing endpoints. (4) No email verification. |
| **Medium** | (1) Rate limits are broad. (2) IDOR risk on orders/resources if company scope not enforced. (3) Password reset token in URL. (4) No security headers (CSP, X-Frame-Options) verified. |
| **Low** | (1) Verbose errors in some responses. (2) No explicit XSS escaping audit (React escapes; SPA innerHTML NOT VERIFIED everywhere). |

**Input validation:** Basic on auth and contact; Zod on AI. No centralized validation or max length on all inputs.  
**Secrets:** In env; default JWT in code. No rotation or vault.  
**Audit trails:** None for admin actions.

---

## 11. Performance / Deployment / Ops Audit

| Area | Finding |
|------|--------|
| **Production build** | WARN | Express has no build; storefront and CatalogOS use `next build`. |
| **Bundle size** | NOT VERIFIED | No bundle analysis in scripts. |
| **Slow routes** | WARN | GET /api/products loads full list and filters in memory; no pagination. |
| **Unoptimized queries** | WARN | Product list in memory; Supabase queries not audited. |
| **Images** | WARN | Product images linked; no image service or optimization. |
| **CDN/static** | WARN | express.static for public; no CDN config. |
| **Deployment** | FAIL | Three apps; different ports; no single Dockerfile or Procfile; env assumptions (DOMAIN, JWT_SECRET, Supabase, Stripe). |
| **Vercel/Supabase** | WARN | Supabase used; main app is Node and writes to file — not serverless-friendly. |
| **Error reporting** | FAIL | No Sentry or equivalent. |
| **Uptime** | FAIL | No health check contract; Fishbowl interval can throw. |
| **Cron/jobs** | WARN | Bulk import worker via HTTP + secret; Fishbowl on interval. No retries or dead-letter. |
| **Backup/recovery** | FAIL | No backup strategy for database.json or Supabase. |
| **Staging vs prod** | WARN | Same codebase; env different. No staging checklist. |
| **Seed/demo data** | WARN | Demo user in code; seed.js for products. Risk of seed in prod. |
| **Email/SMS** | WARN | Nodemailer; optional; no provider abstraction. |
| **SEO/metadata** | WARN | Meta tags and canonical in index.html; storefront has layout. Sitemap and industry routes exist. |

---

## 12. Commercial Readiness Audit

| Area | Status |
|------|--------|
| **Clear offer** | FAIL | No “Plans” or “Pricing” page; B2B pricing “after approval” only. |
| **Pricing readiness** | FAIL | No public pricing; no package structure (e.g. tiers). |
| **Conversion path** | WARN | Register → pending → (undefined) → shop. No “start trial” or “request demo.” |
| **Lead capture** | WARN | Contact form and RFQ; no lead scoring or CRM integration. |
| **Sales readiness** | WARN | Admin can see users and orders; no pipeline or quotes. |
| **Onboarding friction** | FAIL | Approval is opaque; no email verification; no guided setup. |
| **Proof/trust** | WARN | Copy only; no case studies, testimonials, or guarantees. |
| **FAQ/policies** | FAIL | FAQ exists; no Terms of Service, Privacy Policy, or Cookie policy. |
| **Support readiness** | WARN | Contact form; no ticket system or SLA. |
| **Cancellation/refund** | NOT VERIFIED | No flows in code. |

**Can this be sold now?** **No.** No clear offer, no pricing page, no terms. **Would prospects trust it?** **Unlikely** without policies and clear value. **Commercially missing:** Pricing, plans, terms, privacy, support process, and a clear “what you get” and “what happens after signup.”

---

## 13. Missing Product Piece Analysis

**Main gap:** Combination of **technical and data consistency** (products/auth), **workflow and UX** (approval, first value, billing), and **clarity and trust** (value prop, terms, support). Not only “product strategy” or “feature completeness” in isolation.

**Exact weak/absent capabilities:**

- Single source of truth for products and users (read path = write path; no file/DB split).
- Explicit admin role (allowlist or role claim); no “approved = admin.”
- Post-signup path: email verification, approval SLA or status, and “first meaningful action” (e.g. first quote or first order).
- Billing: pricing page, plans, and subscription (or explicit “contact for pricing”).
- Legal and trust: Terms, Privacy, Cookie consent, and support/contact process.
- One coherent “product”: either one app (e.g. Next.js) or clear split (e.g. main app + internal CatalogOS) with shared auth and product source.

**Core user outcome not fully delivered:** “Get the right gloves at B2B pricing with minimal friction.” Friction: approval black box, no guided path, no visible pricing; “right gloves” is partially addressed (AI finder, filters) but catalog can be wrong due to data split.

**Scaffolding vs finished:** Industry pages, nav, and admin tabs feel like **scaffolding**; cart, checkout, and RFQ feel **implemented but not wired** into a single story. Auth and data layer are **prototype** (file + optional Supabase).

**Minimum product improvements before launch:**

1. Fix product read path (use Supabase when configured, or drop Supabase and use file only).
2. Fix admin: require explicit allowlist or role; never treat “approved” as admin.
3. Define and implement “first value” (e.g. request quote with clear next step).
4. Add Terms and Privacy pages and links; add cookie consent if needed.
5. Approval: either automate (e.g. auto-approve with email verification) or show status and “Contact us.”

**Can wait until after first customers:** Advanced reporting, subscription plans, full design system unification, and multi-tenant RLS.

**Ranking:**

1. **Biggest product gap:** **Data and auth consistency** — store and APIs must read from the same source as writes; admin must be explicitly gated; auth must be in one place (Supabase or file, not mixed).
2. **Second:** **Clear first-run and approval** — what happens after signup and how/when they get access.
3. **Third:** **Commercial and trust** — pricing (or “contact us”), terms, privacy, and support.

---

## 14. Launch Blocking Issues Table

| ID | Severity | Area | Issue | Why it matters | File(s) / route(s) | Recommended fix | Launch blocker? |
|----|----------|------|--------|----------------|----------------------|------------------|------------------|
| 1 | Critical | Data | Products read from database.json; CSV/save write to Supabase | Store shows wrong/empty catalog after import | server.js GET /api/products, /api/products/:id, by-slug, seo/industry | Use Supabase for product reads when configured, or remove Supabase product writes | YES |
| 2 | Critical | Auth | requireAdmin passes any approved user when app_admins empty | Any B2B customer can access admin | server.js requireAdmin | Require (admins.length > 0 && allowlist) \|\| dedicated admin role | YES |
| 3 | Critical | Auth | JWT_SECRET default in code | Tokens forgeable if env unset | server.js line 37 | Remove default; fail startup if JWT_SECRET unset | YES |
| 4 | High | Security | Health endpoint exposes env/cwd, no auth | Info disclosure | server.js /api/admin/supabase/health | Require auth or remove sensitive fields | YES |
| 5 | High | Product | No email verification | Fake signups, abuse | server.js register | Add verification flow or document as known risk | YES |
| 6 | High | Commercial | No Terms, Privacy, Cookie | Legal and trust risk | N/A | Add pages and footer links | YES |
| 7 | High | Commercial | No pricing or “offer” page | Users don’t know what they’re buying | N/A | Add pricing or “Contact for pricing” | YES |
| 8 | High | CatalogOS | Ingest/publish APIs unauthenticated | Anyone can trigger ingest or publish | catalogos middleware, env | Enforce auth when CATALOGOS_ADMIN_SECRET set | YES (if CatalogOS in scope) |
| 9 | Medium | UX | Approval is opaque | Users don’t know when they get access | server.js register, app.js | Show “Pending approval” + SLA or “Contact us” | Should fix |
| 10 | Medium | Ops | Three apps, no single deploy story | Hard to run and scale | repo layout | Document run order; add single deploy (e.g. Docker) | Should fix |

---

## 15. 30-Day Production Plan

### Week 1: Critical blockers

- **Must:** Fix product read path: when Supabase is configured, GET /api/products (and related) must read from Supabase. Alternatively, make CSV import and admin save write to database.json so one source of truth. **File:** server.js.
- **Must:** Fix requireAdmin: allow admin only if `(app_admins && app_admins.length && allowlist(user))` or explicit `user.role === 'admin'`. Never allow “approved” alone. **File:** server.js.
- **Must:** Remove JWT_SECRET default; fail startup if unset in production.
- **Must:** Restrict or remove sensitive data from health endpoint; or protect by auth.
- **Should:** Add Terms of Service and Privacy Policy pages and links in footer.

### Week 2: Product completion

- **Must:** Define “first value” (e.g. “Request a quote” with confirmation and “We’ll respond in 24h”).
- **Should:** Approval: add “Pending approval — we’ll email you when ready” and/or “Contact us to expedite.”
- **Should:** Add Pricing page or “Contact for pricing” and link in nav.
- **Can wait:** Subscription plans, advanced reporting.

### Week 3: Hardening and testing

- **Must:** Smoke test: login, product list, one product, add to cart, checkout (or quote).
- **Should:** Email verification (send link, verify token, mark verified).
- **Should:** CatalogOS: enforce auth on ingest/publish when secret is set.
- **Can wait:** Full e2e suite; load testing.

### Week 4: Go-live prep

- **Must:** Runbook: how to start all apps, env vars, Supabase and Stripe.
- **Should:** Error reporting (e.g. Sentry) and health check contract.
- **Should:** Backup strategy for Supabase and any file state.
- **Can wait:** CDN, advanced monitoring.

**Must before launch:** 1–4 and 6–7 (data, admin, JWT, health, terms, pricing).  
**Should before launch:** 5, 8, 9 (verification, CatalogOS auth, approval UX).  
**Can wait:** Subscription, reporting, full e2e, CDN.

---

## 16. Final Truth

**If you launched today:**

- **Likely:** Customers would see an empty or wrong catalog if you use Supabase for import/save (because the store still reads from `database.json`). Any approved B2B user could open admin and see or change companies, pricing, and inventory. Passwords could be forged if JWT_SECRET were left default. There is no email verification, no terms, no pricing page — so trust and legal exposure would be high. Support would have no visibility into “pending approval” or first-run experience.
- **The real missing piece is:** **A single, consistent foundation:** one source of truth for products and users, correct admin gating, and a clear path from signup to first value. On top of that, the product needs a clear offer (pricing or “contact us”), legal pages, and a defined “first win” for the user. Right now the foundation is broken (data split, admin bug), so the product cannot be safely or reliably run in production.
- **I would not put paying users on this yet.** Fix the critical data and auth issues first, add terms and a pricing/offer, and define the post-signup and approval flow. Then re-audit and consider a limited launch (e.g. invite-only) with monitoring and a rollback plan.

---

*End of audit. All findings are based on codebase inspection; items marked NOT VERIFIED were not confirmed in code or runtime.*
