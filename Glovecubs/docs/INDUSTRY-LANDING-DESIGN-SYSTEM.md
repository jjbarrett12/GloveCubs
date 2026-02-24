# GloveCubs Industry Landing Page — Design System

**Designer Agent · Premium, conversion-focused industry pages**

---

## 1. Shared Wireframe Layout: IndustryLandingPage

One layout, one component set. Industry identity comes from **theming only** (colors, imagery, typography nuance), not from structure.

### 1.1 Desktop (≥1024px)

```
+-----------------------------------------------------------------------------+
|  HERO                                                                      |
|  +-----------------------------------------------------------------------+ |
|  |  [Full-bleed BG image - industry-specific]                             | |
|  |  Overlay (industry accent, 20-40% opacity)                             | |
|  |                                                                        | |
|  |     Headline (H1, 48-56px, max 2 lines)                                | |
|  |     Subheadline (body-lg, max-width 560px)                             | |
|  |     [Primary CTA]  [Secondary CTA]                                      | |
|  +-----------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------+
|  PROOF STRIP (single row, compact)                                         |
|  [Logo] [Logo] [Logo] [Logo] - "Trusted by 500+ facilities"                |
+-----------------------------------------------------------------------------+
|  QUICK PICKER                                                              |
|  Chips: [Material] [Thickness] [Size] [Certification]  [Dropdown: Sort]    |
+-----------------------------------------------------------------------------+
|  HIGHLIGHTS (3 cards, equal width, icon + title + 1 line)                  |
|  [Card 1]          [Card 2]          [Card 3]                              |
+-----------------------------------------------------------------------------+
|  COMPLIANCE BADGES (optional, 1 row, icons + labels)                        |
|  [FDA] [ASTM] [Food Safe] ...                                              |
+-----------------------------------------------------------------------------+
|  PRODUCT GRID                                                               |
|  [Card] [Card] [Card] [Card]                                               |
|  [Card] [Card] [Card] [Card]   - 4 cols desktop                            |
+-----------------------------------------------------------------------------+
|  BULK SAVINGS PANEL                                                        |
|  "Save 15-25% on case orders" - [Get B2B pricing]                          |
+-----------------------------------------------------------------------------+
|  FAQ (accordion or 3-5 questions)                                          |
+-----------------------------------------------------------------------------+
|  CTA BLOCK (repeat primary CTA + subtext)                                  |
+-----------------------------------------------------------------------------+
```

### 1.2 Mobile (<768px)

```
+-----------------------------+
|  HERO (tall, image + overlay)|
|  Headline (36-40px)         |
|  Subhead (smaller)         |
|  [Primary CTA]              |
|  [Secondary CTA]            |
+-----------------------------+
|  PROOF STRIP (scroll/hide)  |
+-----------------------------+
|  QUICK PICKER               |
|  Chips (wrap) + [Dropdown]  |
+-----------------------------+
|  HIGHLIGHTS                 |
|  [Card 1]                   |
|  [Card 2]                   |
|  [Card 3]                   |
+-----------------------------+
|  COMPLIANCE (optional)      |
+-----------------------------+
|  PRODUCT GRID (2 cols)      |
+-----------------------------+
|  BULK SAVINGS PANEL         |
+-----------------------------+
|  FAQ                        |
+-----------------------------+
|  STICKY CTA BAR (bottom)    |
|  [Primary CTA]              |
+-----------------------------+
```

**Sticky CTA (mobile only):** Full-width bar, 56px height, primary button style; one action only.

---

## 2. Per-Industry Visual Skin Guide

Global base: **neutral bg/fg**. **Orange is global secondary only**; **Industrial owns orange as primary**.

### 2.1 Medical - Clinical, trust, compliance

| Token   | Value / usage |
|---------|----------------|
| bg      | #FFFFFF |
| fg      | #1a1a2e |
| accent  | #0d9488 (teal) |
| accent2 | #0891b2 or #f0fdfa |
| ring    | #0d9488 |
| overlay | rgba(13, 148, 136, 0.25) |

- **Primary button:** Teal bg, white text. No orange.
- **Secondary:** Outline teal or ghost + teal text.
- **Badges:** Teal border + light teal bg.
- **Hero overlay:** Teal tint; keep image visible.
- **Icons:** Clean, linear; medical/cross where relevant.

### 2.2 Janitorial - Operations-grade, rugged SaaS

| Token   | Value / usage |
|---------|----------------|
| bg      | #0f172a (slate-900) or #1e293b |
| fg      | #f1f5f9 |
| accent  | #facc15 (neon yellow) or #fbbf24 |
| accent2 | #64748b |
| ring    | #facc15 |
| overlay | rgba(15, 23, 42, 0.6) |

- **Primary button:** Yellow bg, dark text.
- **Secondary:** Outline yellow or dark fill + yellow text.
- **Badges:** Yellow border on dark; chips dark bg + yellow text.
- **Hero overlay:** Dark; yellow for headline/CTA only.
- **Icons:** Heavier stroke; cleaning/supply vibe.

### 2.3 Food Service - Fresh, clean, fast workflow

| Token   | Value / usage |
|---------|----------------|
| bg      | #FFFFFF or #f8faf8 |
| fg      | #1e293b |
| accent  | #16a34a (green) or #15803d |
| accent2 | #94a3b8 or #f0fdf4 |
| ring    | #16a34a |
| overlay | rgba(22, 163, 74, 0.15) |

- **Primary button:** Green bg, white text.
- **Secondary:** Outline green or stainless gray.
- **Badges:** Green for Food Safe; stainless for neutral.
- **Hero overlay:** Light; fresh, kitchen feel.
- **Icons:** Clean, rounded; food-safe / hand hygiene.

### 2.4 Industrial - Safety, durability (orange lives here)

| Token   | Value / usage |
|---------|----------------|
| bg      | #FFFFFF or #fafaf9 |
| fg      | #1c1917 |
| accent  | #ea580c or #c2410c (GloveCubs orange) |
| accent2 | #78716c or #fef3c7 |
| ring    | #ea580c |
| overlay | rgba(234, 88, 12, 0.2) |

- **Primary button:** Orange bg, white text.
- **Secondary:** Outline orange or stone.
- **Badges:** Orange for safety; stone for neutral.
- **Hero overlay:** Warm orange tint.
- **Icons:** Bold; shield, gauge, grip.

### 2.5 Automotive - Performance, grip, black + deep red

| Token   | Value / usage |
|---------|----------------|
| bg      | #0c0a09 or #1c1917 |
| fg      | #fafaf9 |
| accent  | #b91c1c or #991b1b (deep red) |
| accent2 | #57534e or #dc2626 |
| ring    | #b91c1c |
| overlay | rgba(0, 0, 0, 0.5); red on type/CTA only |

- **Primary button:** Deep red bg, white text.
- **Secondary:** Outline red or dark gray + red text.
- **Badges:** Red border on dark.
- **Hero overlay:** Dark; red for headline/CTA only.
- **Icons:** Sharp, performance (grip, speed).

---

## 3. UI Detail Specs (shared, then themed)

### Buttons
- **Primary:** Solid accent, white (or dark on yellow) text; 44px min height; 12-16px horizontal padding; radius 8px.
- **Secondary:** Outline accent or ghost; hover: light fill with accent.
- Max 2 CTAs in hero.

### Badges (compliance + chips)
- **Compliance:** Small icon + label; border 1px accent or neutral; bg transparent or accent2; padding 8px 12px; radius 6px.
- **Chips (picker):** Same border/bg; selected: solid accent or strong border + accent text.
- One accent for all badges on page; second color for inactive only.

### Hero overlay
- **Light industries (Medical, Food, Industrial):** 15-30% accent tint; text dark or white per image.
- **Dark industries (Janitorial, Automotive):** 40-60% dark overlay; accent for headline and CTA only.
- Never full-color wash that hides the photo.

### Icon direction
- **Medical:** Linear, clinical (cross, shield, check).
- **Janitorial:** Heavier; buckets, hands, buildings.
- **Food Service:** Rounded, friendly; leaf, hand-wash, tray.
- **Industrial:** Bold, safety; shield, gauge, wrench.
- **Automotive:** Angular, performance; grip, bolt, tire.

---

## 4. "Do Not Do" List

1. **Color:** Max 1 accent + 1 supporting color per industry. No orange as primary outside Industrial.
2. **Cards:** Max 3 highlight cards; same layout every industry.
3. **Proof strip:** One row only; no carousels or multiple proof sections.
4. **Spacing:** Section padding min 48px desktop / 32px mobile. Body min 16px desktop, 14px mobile.
5. **Typography:** Max 2 headline levels in hero (H1 + subhead). Max 2 font weights in hero.
6. **CTAs:** One primary CTA per section; one sticky CTA on mobile.
7. **Badges:** One chip/badge style per page; no mixing pills + tags + ribbons.
8. **Hero:** One hero image per page; one tint (accent or dark) only.

---

## 5. Hero Composition Guidelines (per industry)

### Medical
1. Clinical setting: exam room or clean corridor; gloves in use or on clean surface; cool, even light.
2. Hands + product: clean hands donning gloves; focus on fit and cleanliness.
3. Compliance moment: boxes/packaging with certification cues; organized, sterile.

### Janitorial
1. Operations: janitor cart, bucket, or supply closet; gloves in workflow; realistic.
2. Facility: large floor, warehouse, or hallway; one person in PPE or with supplies.
3. Bulk supply: cases or dispensers in storage; scale and reliability.

### Food Service
1. Prep/kitchen: gloves at prep station or handwashing; clean stainless, fresh ingredients.
2. Service: server or line cook with gloves; fast, food-safe environment.
3. Fresh/clean: gloves + produce or packaging; green or neutral, food-safe feel.

### Industrial
1. Work in progress: worker with gloves in warehouse/factory; safety gear; warm, durable.
2. Product in context: gloves on workbench with tools; grip, thickness implied.
3. Scale: pallets or cases in industrial setting; bulk, reliability.

### Automotive
1. Under hood/shop: mechanic with gloves; tools, engine, or parts; performance, grip.
2. Hands + grip: gloved hands on steering wheel or tool; black/red in frame.
3. Garage/shop: clean shop, car or parts; professional, "pro driver" vibe.

---

## 6. Implementation Notes

- **Single layout component:** IndustryLandingPage with slots for hero, proof, picker, highlights, compliance, grid, bulk panel, FAQ, CTA. No layout variation by industry.
- **Theming:** One token set per industry (e.g. industry-medical, industry-janitorial). Swap when route is medical, janitorial, food-service, industrial, automotive.
- **Assets:** One hero image per industry; same aspect ratio (e.g. 16:9 or 3:1) for consistent overlay.
- **Orange:** In global header/footer use sparingly. On Industrial landing only, orange is primary CTA and main accent.

---

*GloveCubs Designer Agent · Industry Landing Design System v1.0*
