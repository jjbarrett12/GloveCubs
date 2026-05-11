# Route ownership (Phase A)

Canonical policy: **Next.js storefront owns all public/customer HTML**. **Express** owns **`/api/*`**, webhooks, integrations, and **static files** under `public/`. The **legacy SPA shell** (`public/index.html`) is **disabled for customer routes by default** in local dev; it is only served for those routes when **`ALLOW_LEGACY_SPA_HTML=1`** is set (escape hatch).

## Express (`server.js`, default port **3004**)

| Surface | Owner | Notes |
|--------|--------|--------|
| **`/api/*`** | Express | JSON APIs: cart, auth, checkout, admin JSON, integrations. |
| **`/api/admin/*`** | Express | Unchanged (Phase A). |
| **Static assets** | Express `public/` | Files with a normal static extension on the last path segment are not treated as HTML navigations (no redirect). |
| **`/admin*` (browser)** | Legacy SPA (temporary) | **Phase A exception:** GET/HEAD to `/admin` and subpaths are **not** redirected to Next until admin parity is verified. Still served from Express (not gated like customer routes). |
| **Customer HTML** (listed paths) | **Redirect → Next** | When `STOREFRONT_PUBLIC_ORIGIN` is set and valid, GET/HEAD for those paths respond with **HTTP 308** to `{origin}{originalUrl}`. If the origin is missing in **API-only** dev (`GLOVECUBS_DEV_API_ONLY=1`), Express returns **503** + instructions instead of `index.html` unless `ALLOW_LEGACY_SPA_HTML=1`. |

## Next.js storefront (`storefront/`, local dev default **3005**)

| Surface | Owner |
|--------|--------|
| **Marketing, store, workspace, invoice-savings, request-pricing, etc.** | Next (`src/app/...`) |
| **`src/app/api/*`** | Next route handlers (BFF / edge) per feature |

Browser clients should use **`NEXT_PUBLIC_GLOVECUBS_API`** pointing at the Express origin for commerce APIs.

## Redirect policy (Phase A)

- **Status code:** **308 Permanent Redirect** for all Express-initiated public HTML handoffs to the storefront origin (RFC 7538). Same practical effect as 301 for GET/HEAD.
- **Preserve path and query:** `Location` is `normalize(origin) + req.originalUrl`.
- **No redirect:** `/api/*`, asset-like paths (last segment contains `.`), **`/admin*`** (temporary).
- **Non-production boot:** If `STOREFRONT_PUBLIC_ORIGIN` is unset and **`GLOVECUBS_DEV_API_ONLY` is not set**, Express applies **`http://localhost:3005`** as the storefront origin (logged at boot). If **`GLOVECUBS_DEV_API_ONLY=1`**, no default origin is applied; customer routes get **503** unless you set `STOREFRONT_PUBLIC_ORIGIN` or `ALLOW_LEGACY_SPA_HTML=1`.
- **Production:** Invalid or missing `STOREFRONT_PUBLIC_ORIGIN` → process **exits** on boot.

## Customer paths redirected (when origin configured)

`/`, `/invoice-savings`, `/request-pricing`, `/glove-finder`, `/store`, `/contact`, `/faq`, `/resources`, `/brands`, `/industries`, `/quote-cart`, `/login`, `/account`, `/find-my-glove`, `/workspace`, `/gloves`, `/gloves/*`, `/b2b`, `/b2b/*`, `/portal-order`, `/portal-order/*`.

Implementation: `lib/storefront-public-redirect.js`.

## `STOREFRONT_PUBLIC_ORIGIN` enforcement

| `NODE_ENV` | Missing origin | Invalid origin |
|------------|----------------|----------------|
| **`production`** | Process **exits** at startup. | Process **exits** at startup. |
| **Non-production** + default dev | **Unset**, not API-only, and **`ALLOW_LEGACY_SPA_HTML` not set** → boot sets **`http://localhost:3005`** (logged). | **Warn**; no redirect; customer routes → **503** unless `ALLOW_LEGACY_SPA_HTML=1`. |
| **Non-production** + API-only | **Unset** with `GLOVECUBS_DEV_API_ONLY=1` → no default; customer routes → **503** unless `ALLOW_LEGACY_SPA_HTML=1`. | Same as invalid row. |
| **Non-production** + legacy escape | **`ALLOW_LEGACY_SPA_HTML=1`** and unset origin → **no** dev default (legacy SPA may serve customer routes). | Same as invalid row. |

Normalize to `http(s)://host` only (trailing slash stripped on boot).

## Legacy SPA (`public/index.html`)

| `ALLOW_LEGACY_SPA_HTML` | Customer routes (same path list as redirects) |
|-------------------------|--------------------------------------------------|
| **Unset / not `1`** | **Never** served `index.html` when redirect is not in effect (503 dev gate instead). |
| **`1`** | Legacy SPA may be served (escape hatch for rare debugging). |

Admin `/admin*` is unchanged: not redirected to Next and not subject to this customer-route gate.

## Next.js redirects (`storefront/next.config.mjs`)

After Express **308**, the browser requests the **same path** on the storefront origin. Next applies additional redirects where needed:

- `/workspace` → `/workspace/procurement` (308)
- `/workspace/` → `/workspace/procurement` (308)
- `/b2b` → `/request-pricing` (308)
- `/gloves` and legacy `/gloves/...` shapes → `/store` or `/store/p/:slug` (308)
- `/portal-order/...` → `/` (**307** temporary until a dedicated order-view route exists)

## Drift checks

- **No duplicate public homepage:** Express must not return `index.html` for `/` on customer routes when redirects apply — it must **308** to Next. In local dev without a storefront origin and without `ALLOW_LEGACY_SPA_HTML=1`, customer routes must **not** silently serve `index.html` (503 gate or dev default origin applies).
- **No duplicate invoice-savings HTML on Express** under the same rules — **308** to Next when origin is configured (or dev default).
- **Ambiguous ownership:** New customer-facing paths must be added to `lib/storefront-public-redirect.js` and this doc together.
- **API safety:** `/api/*` must never be redirected to Next by this mechanism.

## Local development

| Port | Process | Command |
|------|---------|---------|
| **3005** | Next.js storefront (customer HTML) | `npm run dev:storefront` |
| **3004** | Express API (`/api/*`, admin SPA, static assets) | `npm run dev:api` |
| **Both** | Recommended: one terminal | **`npm run dev`** (runs Express + Next via `concurrently`; sets `STOREFRONT_PUBLIC_ORIGIN=http://localhost:3005` for Express) |

- **`npm run dev`**: Express on **3004** + Next on **3005**; customer paths on Express **308** to Next.  
- **`npm run dev:api`**: Express only (`GLOVECUBS_DEV_API_ONLY=1`); **no** dev default origin — set `STOREFRONT_PUBLIC_ORIGIN` yourself or accept **503** on customer HTML routes (APIs still work).  
- **`npm run dev:legacy`**: Legacy customer SPA allowed (`ALLOW_LEGACY_SPA_HTML=1`) — **not** recommended for normal work.

Optional root `.env`: `STOREFRONT_PUBLIC_ORIGIN=http://localhost:3005` (redundant with `npm run dev` and with non-production dev default when not API-only).

Smoke: `curl -sI http://localhost:3004/` → **`308`** with `Location: http://localhost:3005/` when redirects are active.

Canonical **HTML** tests should hit **3005**; **API** tests hit **3004**.

---

## Production domain + API host (verified 2026-05-07)

**Intended public customer domain (from repo examples, not Vercel proof):** `https://glovecubs.com` — see root `.env.example` (`DOMAIN=`), `docs/LAUNCH_READINESS.md`, `docs/PRODUCTION_DEPLOYMENT.md`. **Canonical storefront for Phase A redirects** should match the URL customers use (**`https://www.glovecubs.com`** or apex — see live HTTP below).

**Intended Express/API host:** Not hard-coded in repo; deploy per `docs/PRODUCTION_DEPLOYMENT.md` (Vercel/Railway/etc.). **Recommended topology:** `glovecubs.com` + `www.glovecubs.com` → Next storefront; **`api.glovecubs.com`** (or dedicated host) → Express `server.js` for `/api/*`.

### DNS (Google public resolver `8.8.8.8`)

| Host | Record | Target / value |
|------|--------|----------------|
| `glovecubs.com` | **A** | `76.76.21.21` |
| `www.glovecubs.com` | **CNAME** | `4acd8babeae86db7.vercel-dns-017.com` → A `64.29.17.1`, `216.198.79.1` |

Apex and **www** use **different** Vercel-facing records (apex A vs www CNAME to `vercel-dns-017`).

### Live HTTP (re-checked 2026-05-07 later same day)

| URL | Result |
|-----|--------|
| `https://glovecubs.com/` | **307** → `Location: https://www.glovecubs.com/` |
| `https://glovecubs.com/invoice-savings` | **307** → `Location: https://www.glovecubs.com/invoice-savings` |
| `https://www.glovecubs.com/` | **200** `text/html`, `X-Matched-Path: /`, ETag `3b1aadd788b931614e4aaf225f4b6750` |
| `https://www.glovecubs.com/invoice-savings` | **200** `text/html`, `X-Matched-Path: /invoice-savings`, ETag `8a2d7d9001c49d10c04f072c0d1e7f7c` |
| `https://glovecubs.vercel.app/` | **200** — **same** ETag as `www` home |
| `https://glovecubs.vercel.app/invoice-savings` | **200** — **same** ETag as `www` invoice page |

Same **ETag** + **Content-Length** on `www` and `glovecubs.vercel.app` indicates the **same built artifacts** (same deployment / project). Apex only **redirects to www** (Vercel domain / redirect config).

**Earlier `DEPLOYMENT_NOT_FOUND`:** Was observed when custom hostnames were not yet bound to a live production deployment; **not** reproduced after domains were attached (verify in dashboard if regressions occur).

### Vercel storefront project (operator checklist)

- **Root Directory:** `storefront` (this repo’s Next app) — **confirm in Vercel UI** (not inferrable from HTTP alone).
- **Domains:** **`glovecubs.com`** and **`www.glovecubs.com`** should remain on the **same** project as `glovecubs.vercel.app`; production **Deployment Aliases** in the dashboard must list these hosts.
- **`NEXT_PUBLIC_GLOVECUBS_API`:** Set to the **origin that runs `server.js`** in production (e.g. `https://api.glovecubs.com`), no trailing slash.

### Express production (operator checklist)

- **`STOREFRONT_PUBLIC_ORIGIN`:** Must equal the **final** storefront URL customers use (e.g. `https://glovecubs.com` after domain fix, or `https://glovecubs.vercel.app` during transition). Required when `NODE_ENV=production` or process exits (`lib/storefront-public-redirect.js`).
- **CORS:** If API and storefront are different origins, allow the storefront origin on Express where credentials/browser `fetch` require it.

### Smoke: `curl -I`

**Storefront (Next):**

```bash
curl -sI "https://www.glovecubs.com/"
curl -sI "https://www.glovecubs.com/invoice-savings"
curl -sI "https://glovecubs.vercel.app/"
curl -sI "https://glovecubs.vercel.app/invoice-savings"
curl -sI "https://glovecubs.vercel.app/request-pricing"
curl -sI "https://glovecubs.vercel.app/store"
```

Expect **200** on `www` and `*.vercel.app` (apex may **307** to `www`). Compare **ETag** / **Content-Length** across hosts to confirm same deployment.

**Express (API + optional HTML redirect host):**

```bash
curl -sI "https://<EXPRESS_HOST>/"
curl -sI "https://<EXPRESS_HOST>/invoice-savings"
curl -sI "https://<EXPRESS_HOST>/gloves/foo/bar"
curl -sI "https://<EXPRESS_HOST>/api/config"
```

Expect **308** to storefront for the first three when `STOREFRONT_PUBLIC_ORIGIN` is set; **`/api/config`** must **not** be a 308 to the storefront.

**Note:** `GET /api/health` is **not** implemented on Express. Use **`GET /api/config`** or **`GET /api/admin/supabase/health`** (admin/diagnostics) per `server.js`.

### Repo doc drift

- Root **`vercel.json`** is **not** present in this workspace; `VERCEL_GIT_DEPLOY.md` describes an older **single Express-on-Vercel** layout. **Storefront** deploy should use Vercel **Root Directory = `storefront`**, not that legacy snippet.

---

## Phase A — Canonical host split (www vs api)

| Host | Owner | Browser role |
|------|--------|----------------|
| **`https://www.glovecubs.com`** (and apex → `www`) | **Next storefront** | All customer HTML: marketing, store, invoice upload UX, workspace, quote cart. |
| **`https://api.glovecubs.com`** (or dedicated Express origin) | **Express `server.js`** | **`/api/*`**, webhooks, Stripe callbacks, legacy admin JSON, long-lived jobs. Never the canonical **marketing** origin. |

**Storefront env:** `NEXT_PUBLIC_GLOVECUBS_API` = **Express API origin only** (local `http://localhost:3004`, prod `https://api.glovecubs.com`). Read it via `storefront/src/lib/api.ts` (`getExpressCommerceApiOrigin`). Do not use it as the public “website” URL in UI.

**Express env:** `STOREFRONT_PUBLIC_ORIGIN` = final **Next** URL customers use (e.g. `https://www.glovecubs.com`).

---

## Phase A — Operator surfaces (no full admin migration)

| Surface | Where | Notes |
|---------|--------|--------|
| **Next procurement admin** | `/admin/procurement/*` on the **storefront** origin | Supabase-backed operator UI; gate via `ADMIN_LEADS_SECRET` / middleware in prod. |
| **Next admin misc** | `/admin/*` (e.g. leads, product-import read-only) | Same origin; not customer-facing. |
| **Express legacy admin SPA** | **`/admin*` HTML on the Express host** | Still served when requests hit Express (not 308’d). JSON under **`/api/admin/*`**. |
| **Customer workspace** | **`/workspace` and `/workspace/` → `/workspace/procurement`** (Next redirect) | Authenticated procurement session enforced in `workspace/procurement/layout.tsx`; anonymous users land on `/` after redirect. |

Operators should prefer **www** + `/admin/...` for new procurement work; legacy commerce admin may still require the **Express** `/admin` SPA until Phase B+.

### Procurement operator trust (current)

- **Who can act:** `getAdminUser` (`storefront/src/lib/admin/get-admin-user.ts`) treats any **active** `public.admin_users` Supabase auth principal as a **trusted global operator** for Next `/admin/**` and `/admin/api/**` routes. **Per-company ACLs are not implemented** — cross-company visibility is intentional for this internal surface until a stricter model ships.
- **Semantics:** `lifecycle_stage` values such as `quote_linked` reflect **durable spine linkage** (e.g. `quote_request_id` present / cart intake), not proof of customer email delivery or PO receipt. Use `sales_follow_up` when commercial follow-up is required (e.g. after `notification_failed` on intake email).

### Phase A — optional live redirect smoke

With Express and Next running locally (see **Local development** above), assert headers:

`RUN_PHASE_A_LIVE=1 node scripts/verify-phase-a-redirects.cjs`

Or print the `curl` matrix without asserting:

`node scripts/verify-phase-a-redirects.cjs`
