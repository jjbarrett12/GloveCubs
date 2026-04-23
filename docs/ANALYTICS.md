# GloveCubs analytics and attribution

This document matches the implementation checklist for traffic, behavior, conversion, and revenue by channel.

## A. Analytics tools integrated

| Tool | Role |
|------|------|
| **Google Analytics 4** | Page views (manual `page_view` / `purchase`), traffic and conversion in GA reports when `GA4_MEASUREMENT_ID` is set. |
| **PostHog** | Same named events for funnels and product analytics when `POSTHOG_KEY` (and optional `POSTHOG_HOST`) are set. |

Scripts load asynchronously from `public/js/analytics.js` after `/api/config` returns; checkout does not await third-party SDKs.

## B. Events implemented

Client (`GloveCubsAnalytics` in `public/js/analytics.js`), wired from `public/js/app.js` where applicable:

| Event | When |
|-------|------|
| `page_view` | After each successful `navigate()` render |
| `product_view` | Product detail loaded |
| `add_to_cart` | Add to cart (detail, quick add, favorites) |
| `view_cart` | Cart page with items |
| `begin_checkout` | Checkout page after quote load |
| `checkout_quote` | Server quote applied to DOM |
| `purchase` | After successful Net 30 order or Stripe `confirmPayment` success — **payload from `purchase_analytics` in API response only** |
| `reorder` | Reorder modal submit or quick add-all |
| `net30_application_started` | First focus into invoice terms form |
| `net30_application_submitted` | Successful net terms application POST |
| `quote_requested` | Successful RFQ submit |
| `contact_submitted` | Successful contact form submit |

GA4 recommended names are mirrored where applicable (`purchase`, etc.).

## C. Where UTM data is stored

- **Browser:** First-touch + session merge in `localStorage` / `sessionStorage` (`gc_utm_first`, `gc_utm_session`) — see `public/js/analytics.js`.
- **Orders:** Sanitized JSON on `orders.marketing_attribution` (Supabase JSONB). Migration: `supabase/migrations/20260705120000_orders_marketing_attribution.sql`.
- **Allowed keys** (server): `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `fbclid`, `msclkid`, `ttclid`, `first_seen_at`, `landing_path` — see `lib/marketing-attribution.js`.

Checkout sends `marketing_attribution` on `POST /api/orders` and `POST /api/orders/create-payment-intent`; the server never uses it for pricing.

## D. Admin reporting

- **API:** `GET /api/admin/analytics/channels` (admin JWT), implemented in `services/adminChannelAnalyticsService.js`.
- **UI:** Admin → **Operations** → **Marketing / UTM** (`loadAdminChannelAnalytics` in `public/js/app.js`).

Shows revenue, orders, AOV by channel string, top campaigns, and sample-level new vs repeat counts (see limitations).

## E. Limitations

1. **Sample window:** Channel report scans the most recent N orders (default ~12k, max 20k), not full history.
2. **New vs repeat:** Defined as first vs later order per `company_id` **within that sample**, not lifetime cohorts.
3. **Attribution gaps:** Orders without `marketing_attribution` appear under “(no attribution)”.
4. **pending_payment / cancelled:** Excluded from channel revenue rollups.
5. **Purchase in GA/PostHog:** Fired from the browser using **server-built `purchase_analytics`**; if the user closes the tab before the success handler runs, client-side purchase may be missing (server row and money are still correct).
6. **PostHog loader URL:** Uses `{POSTHOG_HOST}/static/array.js`; confirm host matches your PostHog region.

## Environment

See `.env.example`: `GA4_MEASUREMENT_ID`, `POSTHOG_KEY`, `POSTHOG_HOST`.
