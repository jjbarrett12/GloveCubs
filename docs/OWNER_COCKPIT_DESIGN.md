# GloveCubs Owner Cockpit — Product & UX Specification

**Audience:** Business owner operating B2B wholesale (gloves/PPE).  
**Metaphor:** Command center — Stripe Dashboard × Shopify Admin × Linear × trading terminal.  
**Mode:** Dark-first. Orange = **action only**, never decoration.

---

## 1. Full layout structure (annotated)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR (sticky, z-20)                                                       │
│ [Logo + Owner Cockpit] [──────── Global search ────────] [+ Create ▼]      │
│ [🔔 n] [● Sys OK] [Owner] [Avatar ▼]                                         │
│   ↑        ↑         ↑        ↑                                              │
│   badge   health    role    profile                                          │
└─────────────────────────────────────────────────────────────────────────────┘
┌──────────┬──────────────────────────────────────────────────────────────────┐
│ SIDEBAR  │ MAIN SCROLL REGION                                                │
│ (fixed   │                                                                   │
│  w-56)   │  Page title (optional) + primary content                          │
│          │                                                                   │
│ Overview │  ┌─ Overview: KPI strip ─────────────────────────────────────┐   │
│ Customers│  │ [KPI][KPI][KPI]... (click-through to drill)              │   │
│ Orders   │  └──────────────────────────────────────────────────────────┘   │
│ Products │  ┌─ Alert center (priority) ──────────────────────────────────┐ │
│ …        │  │ Severity-sorted rows: count · copy · primary CTA          │ │
│          │  └────────────────────────────────────────────────────────────┘ │
│ [badge]  │  ┌─ Charts row (4 + 2 insight cards) ─────────────────────────┐ │
│ on nav   │  │ Spark/line charts + top customers + category mix           │ │
│ items    │  └────────────────────────────────────────────────────────────┘ │
│          │  ┌─ Inventory intel + Activity (2-col on xl) ──────────────────┐ │
│          │  │ Low stock / reorder / velocity │ Dense activity feed        │ │
│          │  └────────────────────────────────────────────────────────────┘ │
│          │  Quick actions grid (7 tiles, icon + label, no fluff)           │
└──────────┴──────────────────────────────────────────────────────────────────┘
```

**Grid rules**

- Main content: `max-w-[1600px]` optional; often full-bleed tables use full width.
- Sidebar never competes with content — narrow, typographic.
- Top bar height ~48px; single row where possible.

---

## 2. Component breakdown

| Component | Responsibility |
|-----------|----------------|
| **AppShell** | TopBar + Sidebar + `<main>` slot; provides route context. |
| **TopBar** | Brand, command palette trigger (search), QuickCreate dropdown, notif bell, health dot, role pill, user menu. |
| **SidebarNav** | Section groups; item = icon + label + optional count badge; active = left accent bar + elevated bg. |
| **KpiStrip** | 8 tiles: value (tabular nums), micro-trend (↑/↓ + % or vs prior), label, entire tile clickable. |
| **AlertCenter** | Sortable list; `severity`: info / warn / danger; each row: icon strip, title, count pill, one primary action. |
| **ChartCard** | Title, period selector (7d/30d/MTD), SVG spark/area; no chart junk (no 3D). |
| **InsightCard** | Ranked list (top customers) or breakdown bars (category %). |
| **InventoryIntel** | Tabs or stacked: Low stock table, Reorder queue, Velocity split, Stock $ summary. |
| **ActivityFeed** | Chronological; `actor · verb · object · relative time`; optional filter chips. |
| **QuickActionGrid** | 7 actions max visible; primary CTA styling only on “Create” in top bar. |
| **DataTable (ops)** | Sticky toolbar, bulk bar, dense tbody, drawer on row. |
| **CustomerDrawer** | Tabs: Overview, Orders, Pricing, Invoices, Notes, Activity. |
| **ProductPricingTable** | Highlights: missing cost, margin < threshold, override flag. |

---

## 3. Visual hierarchy (owner-first)

1. **Attention** — Alert center + red/amber severity always above decorative charts.
2. **Money** — KPI strip second: today, MTD, margin, AR/AP before “nice to know” charts.
3. **Liquidity & fulfillment** — Open orders, low stock adjacent to revenue (cash vs ops risk).
4. **Depth** — Charts and feeds support decisions; they don’t replace alerts.
5. **Actions** — Orange only on buttons that change state (Create, Fix, Record payment).

**Type scale (dense)**

- KPI value: `text-xl font-semibold tabular-nums`
- KPI label: `text-[10px] uppercase tracking-widest text-zinc-500`
- Panel title: `text-xs font-semibold uppercase tracking-wide text-zinc-400`
- Body table: `text-xs` / `text-[11px]`
- De-emphasize helper copy; no marketing paragraphs on overview.

**Surfaces**

- Base: `#0d1117`
- Raised panel: `#161b22` + `border border-white/[0.06]`
- Hover row: `#1c2128`
- Input inner: `#0d1117` or `#21262d`

---

## 4. Key UI patterns

### Alerts

- Left border 2px: `emerald` (info), `amber` (warn), `red` (danger).
- Row height compact (~40px); count as monospace pill.
- One verb-led CTA: “Review orders”, “Fix costs”, not “Learn more”.

### Tables (ops)

- Header sticky within scroll container; toolbar sticky above table.
- Numeric columns `text-right tabular-nums`.
- Status: `9px uppercase` badges, neutral bg unless exception.
- Row hover subtle; selected = left orange bar + bg tint.
- Bulk bar appears when selection > 0 (or always minimal strip).

### Drawers (CRM)

- Right rail 420–480px; tabs as underline segments; no giant cards inside.

### Charts

- 1px grid lines at 4% opacity; single series line `#e67a2e` or neutral `#6e7681` for comparison.
- No gradients unless area under revenue (very subtle).

---

## 5. Weak areas in current implementation — suggestions

| Area | Issue | Improvement |
|------|--------|-------------|
| **Overview** | Mixed mock vs live; some queues empty | Back alerts with real API counts; fallback to “No items” one-liner, not filler cards. |
| **KPI trends** | Fake deltas erode trust | Show trend only when time-series exists; else “—” or sparkline from last 7 points. |
| **Charts** | Easy to look decorative | Default to 30d revenue + orders; second chart margin; keep pixel height ≤160. |
| **Customers** | Tier/margin partly enriched | Pull last order + balance from orders/AR APIs when available. |
| **Products** | Pricing risk scattered | Single “Pricing health” alert rollup: missing cost, margin <12%, override conflicts. |
| **Inventory** | Reserved/incoming partly synthetic | Label as “planned” or hide until WMS; avoid fake precision. |
| **Nav badges** | Not wired | Orders pending ship, RFQs open, AR 30+ — surface counts on sidebar. |
| **Automations / Audit** | Placeholder | Stub routes with honest “Coming soon” one line vs empty pages. |
| **Global search** | Low ROI if not omnisearch | Phase 1: jump to SKU, order #, company name via same endpoint. |

---

## 6. High-fidelity UI

Implemented as a **static preview** (no backend):

- **Route:** `/owner-cockpit` in the Next.js storefront (`storefront/`).
- **Run:** `cd storefront && npm run dev` → open `http://localhost:3000/owner-cockpit`
- **Files:** `src/components/owner-cockpit/CockpitOverview.tsx`, `src/app/owner-cockpit/page.tsx`
- **Stack:** React + Tailwind; palette aligned to live cockpit (`#0d1117`, `#161b22`, `#e67a2e` action only).

Use this page as the visual reference for migrating the live `public/js` cockpit.

---

## Navigation map (sidebar order)

1. Overview  
2. Customers  
3. Orders  
4. Products  
5. Inventory  
6. Pricing *(or merged Products — owner call)*  
7. Vendors  
8. Purchase Orders  
9. AR / AP  
10. Reports  
11. Users & Roles  
12. Messages  
13. Automations  
14. Settings  
15. Audit Log  

Badges: `Orders` (ship queue), `Messages` (unread), `AR/AP` (past due count) — when data exists.
