# Homepage Hero: Procurement Engine Design

Design upgrade applied so the hero feels like a **premium operator procurement engine** while keeping headline and subheadline copy unchanged and preserving brand orange.

---

## Before / After: Visual Hierarchy

| Priority | Before | After |
|----------|--------|--------|
| **1st** | Headline + primary CTA | **Headline** → **Primary CTA** (“Get Distributor Pricing”) with microcopy “Takes ~20 seconds. No account required.” |
| **2nd** | Secondary CTA + trust tiles | **Quick Bulk Builder** (right) + **Secondary CTA** (outlined, subdued) |
| **3rd** | Builder + AI card | **Operator badges** (Net Terms, Case & Pallet, Dedicated Rep) + **AI Spend Snapshot** (dark card, orange strip) |

**Intent:** Left = positioning + primary action; right = “order machine” + savings insight. One clear primary CTA; secondary and tools support without competing.

---

## Design Tokens & Component Classes

All styles are scoped under `.hero-procurement` (section) and use existing `:root` where applicable.

### Background & depth
- **`.hero-bg-base`** — Dark gradient: `#0d0d0f` → `#14161a` → `#111318` → `#0a0c0f`.
- **`.hero-bg-glow`** — Radial orange glow behind headline: `rgba(255, 122, 0, 0.12)` → transparent, low opacity.
- **`.hero-bg-texture`** — Subtle SVG noise texture, ~6% opacity, for a light “volume” feel without distraction.

### CTAs
- **`.hero-cta-primary`** — Filled orange gradient, shadow, hover lift (~3px), focus ring `rgba(255, 122, 0, 0.5)`.
- **`.hero-cta-secondary`** — Outlined (border `rgba(255,255,255,0.35)`), transparent bg, subtle hover.
- **`.hero-cta-microcopy`** — Small, muted text under primary: “Takes ~20 seconds. No account required.”

### Operator badges (mini tiles)
- **`.hero-operator-badges-card`** — Container: dark glass (`rgba(255,255,255,0.06)`), thin border, 10px radius.
- **`.operator-badge`** — Icon + title + one line; min-height 56px; subtle border; hover: orange tint and slight lift.

### Builder (machine panel)
- **`.hero-panel-builder`** — White card, 2px orange-tinted border, consistent padding, crisp shadow.
- **`.hero-panel-input`** — Min-height 40px, 8px radius, focus: orange ring `0 0 0 3px rgba(255, 122, 0, 0.2)`.
- **`.hero-panel-btn-primary`** — “Build My Bulk Order”: filled orange, hover lift, focus ring.

### AI Spend Snapshot
- **`.hero-ai-header-strip`** — Orange gradient strip; title only.
- **`.hero-ai-body-dark`** — Dark body `#1a1d24`; bullets in a compact block.
- **`.hero-ai-bullets`** — 2 lines visible by default; `hero-ai-expanded` reveals full list; “Show more” toggles.
- **`.hero-ai-upload-btn`** — Compact outlined orange button.

### Nav → hero spacing
- **`.hero-procurement`** — `padding-top: calc(var(--hero-header-height) + 8px)` so content clears the header; fold remains intentional.

---

## Responsive Notes

- **Desktop (≥1024px):** Two-column layout (5fr / 7fr). Hero height `calc(100vh - var(--hero-header-height))`. AI panel body always visible; chevron toggle hidden.
- **Tablet (768px–1023px):** Single column; builder and AI snapshot stack. AI body collapsible via chevron. Operator badges stay 3 columns.
- **Mobile (<768px):** Tighter top padding. CTAs stack full-width. Operator badges 3 columns, smaller type (11px / 10px). Builder and AI panel full width; AI collapse toggle shown.

---

## Quality Bar

- **Procurement SaaS + distributor** hybrid: authoritative, bulk-order focused, no generic e‑commerce look.
- **Clean, confident:** No gimmicky animation; only subtle motion (hover lift, focus ring, soft shadow).
- **Contrast:** Text remains readable on all backgrounds; orange used as accent, not overwhelming.
