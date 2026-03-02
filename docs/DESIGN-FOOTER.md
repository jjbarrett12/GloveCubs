# Footer: Premium Link & Chip Styling

Design tokens and component classes for the GloveCubs footer. Content structure and link destinations are unchanged; only styling and affordances were updated.

---

## 1. Text links

- **Base:** `color: rgba(255, 255, 255, 0.7)` (white/70)
- **Hover:** `color: #ffffff` + `transform: translateX(3px)` (no underline; consistent with “translate + color shift”)
- **Focus-visible:** Orange ring `box-shadow: 0 0 0 2px rgba(255, 122, 0, 0.55)`
- **Active:** Slightly brighter white
- **Transition:** `0.18s ease` (~150–200ms)

**Classes:** `.footer-col ul li a` (Quick Links + Contact links inherit)

---

## 2. Brand chips / logos

- **Container:** `.footer-brand-logos` — 2-column grid, `gap: 10px`
- **Chip:** `.footer-brand-link` (each brand anchor)
  - **Style:** Dark chip `background: rgba(255, 255, 255, 0.06)`, light border `1px solid rgba(255, 255, 255, 0.12)`
  - **Shape:** `border-radius: 10px` (rounded-lg)
  - **Size:** `min-height: 52px`, `height: 52px`, padding `10px 12px`
- **Hover:** Slight lift `translateY(-2px)`, stronger border `rgba(255, 122, 0, 0.35)`, soft shadow
- **Focus-visible:** Orange ring `0 0 0 2px rgba(255, 122, 0, 0.35)`
- **Transition:** `0.18s ease`
- **Logo/fallback:** `.footer-brand-logo` max-height 28px, max-width 80px; `.footer-brand-fallback` 12px, semibold

---

## 3. Social icon buttons

- **Container:** `.social-links` — flex, `gap: 10px`
- **Button:** Each `a` — circular `40×40px`, `border-radius: 50%`
  - **Base:** `background: rgba(255, 255, 255, 0.08)`, `border: 1px solid rgba(255, 255, 255, 0.12)`, `color: rgba(255, 255, 255, 0.85)`, `font-size: 15px`
- **Hover:** Orange tint `rgba(255, 122, 0, 0.22)`, `color: #fff`, `translateY(-2px)`
- **Focus-visible:** `box-shadow: 0 0 0 2px rgba(255, 122, 0, 0.55)`
- **Transition:** `0.18s ease`

---

## 4. Footer logo area

- **Wrapper:** `.footer-logo`
- **Link:** `.footer-logo-link` on the `<a>` (clickable affordance)
  - **Hover:** Slight opacity reduction
  - **Focus-visible:** Orange ring `0 0 0 3px rgba(255, 122, 0, 0.5)`
- **Image:** `.footer-logo-image` — 80px height, invert filter for dark theme
- **A11y:** `<span class="sr-only">Home</span>` inside the link for screen readers

---

## 5. Layout and rhythm

- **Grid:** `.footer-grid` — 4 columns, `gap: 32px 28px`, `padding-bottom: 28px`, `border-bottom: 1px solid rgba(255, 255, 255, 0.1)` (border-white/10)
- **Headings:** `.footer-col h4` — 11px, uppercase, letter-spacing 0.1em, orange `var(--primary)`, `margin-bottom: 12px`
- **Link lists:** `ul` — `gap: 2px` (space-y ~2); contact list items `padding: 6px 0`
- **Bottom bar:** `.footer-bottom` — `border-top: 1px solid rgba(255, 255, 255, 0.1)`, `padding: 18px 0`

---

## Constraints

- No new content or link destinations; structure unchanged.
- No heavy animation or neon effects; transitions ~150–200ms, subtle lift/shadow only.
- Focus states use orange or white ring for keyboard users; contrast preserved.
