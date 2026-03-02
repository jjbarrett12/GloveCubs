# Hero Above-the-Fold Viewport Test (GloveCubs)

## Primary requirement

On desktop (1440×900, 1536×864, 1280×720), the following must be visible **without any page scroll**:

- Headline + subheadline (copy unchanged)
- Both CTAs (Get Distributor Pricing, Try AI Glove Finder)
- 3 mini feature tiles (Net Terms / Case & Pallet / Dedicated Rep)
- Quick Bulk Builder including "Build My Bulk Order" button
- AI Spend Snapshot including Upload Invoice button

Internal scroll only inside: "Use (Select Multiple)" list and optional "Show more" in Spend Snapshot.

---

## How to run the test locally

### Option 1: Chrome DevTools device toolbar

1. Open the site (e.g. `http://localhost:3004` or your dev URL).
2. Press **F12** → open **Device Toolbar** (Ctrl+Shift+M) or the device icon.
3. Set **Dimensions** to **Responsive** and enter:
   - **1440** × **900**
   - **1536** × **864**
   - **1280** × **720** (stress)
4. For each size, ensure the viewport is exactly that (no browser chrome in the measure; use "No throttling").
5. Check: no vertical page scroll is needed to see all hero elements listed above.

### Option 2: Dev console helper (presets)

With the homepage loaded, open the console (F12 → Console) and run:

```js
// Apply a preset (resizes the window; use in a window that allows resize)
window.glovecubsViewportTest('1440x900');   // or '1536x864' or '1280x720'
// Then re-run hero logic (in case you resized manually):
if (window.initHeroDashboard) initHeroDashboard();
```

To only re-apply dense/tabbed without resizing:

```js
if (document.getElementById('homeHero') && window.initHeroDashboard) initHeroDashboard();
```

### Option 3: Manual resize

1. Restore down the browser window (not full screen).
2. Resize to **1440×900**, **1536×864**, or **1280×720** (use a ruler or DevTools → toggle device toolbar and set custom dimensions).
3. Refresh the page so `initHeroDashboard()` runs with the new size.
4. Confirm no page scroll is required for the hero content.

---

## Viewport behavior

| Viewport      | Expected behavior |
|---------------|-------------------|
| **1440×900**  | Hero uses full height; dense mode **on** (h ≤ 900). All hero elements visible, no page scroll. |
| **1536×864**  | Dense mode **on**. Tabbed mode **off** (h ≥ 820). All hero elements visible, no page scroll. |
| **1280×720**  | Dense + **tabbed** (h < 820). Right column shows "Bulk Builder" / "Spend Snapshot" tabs; tab headers and active panel visible above the fold. No page scroll. |

---

## Pass/fail checklist (per viewport)

- [ ] Headline "Built for Operators Who Buy by the Case" visible
- [ ] Subheadline "Distributor-level pricing. No contracts. No games." visible
- [ ] Both CTAs visible (Get Distributor Pricing, Try AI Glove Finder)
- [ ] 3 tiles visible (Net Terms, Case & Pallet, Dedicated Rep)
- [ ] Quick Bulk Builder card visible with "Build My Bulk Order" button
- [ ] AI Spend Snapshot card visible with Upload Invoice button (or tab to switch to it at 720)
- [ ] No vertical page scroll required to see the above

---

## Technical notes

- Hero root uses `min-height` / `max-height: calc(100vh - var(--hero-header-height))` and `overflow: hidden` on desktop (min-width: 1024px).
- `--hero-header-height` is set from JS (utility bar + header measured height); fallback in CSS is 88px.
- **Dense mode** (`hero-dense`): applied when width ≥ 1280 and height ≤ 900; reduces headline size, padding, and list heights.
- **Tabbed mode** (`hero-tabbed`): applied when width ≥ 1280 and height < 820; right column becomes two tabs so both panels remain accessible without page scroll.
