# GloveCubs Industry Pages — Debug Report

**Scope:** `/industries/[slug]` landing pages (medical, janitorial, food-service, foodservice, industrial, manufacturing, automotive, food-processing).  
**Stack:** Express + vanilla JS SPA; no Next.js (hero images use `<div style="background-image:url(...)">`, not next/image).

---

## 1. Routing

| Issue | Severity | Status | Fix / QA |
|-------|----------|--------|----------|
| Unknown slug does not show a clear 404 | **Medium** | **Fixed** | **Fix:** In `renderIndustryPage` catch block, detect 404 via `e.message` and show "Industry Not Found" + `setPageMeta('Industry Not Found', '')`. **QA:** Visit `/industries/unknown-slug/` → title and heading show "Industry Not Found", link to browse gloves works. |
| All 5 config slugs + nav slugs render | **Low** | **Fixed** | **Fix:** Normalize config lookup: `foodservice` → `food-service`, `manufacturing` → `industrial`, `food-processing` → `food-service` so nav links get correct hero/copy/CTAs. **QA:** Open Industries → Food Service (foodservice), Manufacturing, Food Processing; each shows correct headline and config. |
| Internal nav links (Industries dropdown) | **OK** | — | **QA:** Click Industries → Medical / Food Service / Janitorial / Manufacturing / Food Processing / Automotive; each loads correct industry page and URL updates to `/industries/<slug>/`. |
| Back/forward preserves URL and re-renders | **OK** | — | **QA:** Open industry page, change quick-picker (URL gets ?material=…), navigate away, then Back → industry page and filters (from URL) restore. |

---

## 2. Theming

| Issue | Severity | Status | Fix / QA |
|-------|----------|--------|----------|
| `data-industry` on page root | **OK** | — | Section has `data-industry="<slug>"` from `buildIndustryLandingHTML`. **QA:** Inspect `#industryLanding` or `.industry-landing` → `data-industry` matches slug (e.g. medical, foodservice). |
| CSS variables per industry | **Fixed** | **Fixed** | **Fix:** Added `[data-industry="foodservice"]`, `[data-industry="manufacturing"]`, `[data-industry="food-processing"]` with same tokens as food-service / industrial so accent is not orange for medical/food/janitorial. **QA:** Medical/foodservice/janitorial use blue/teal/green accents; industrial/automotive use orange/gray. |
| Theme leakage on client navigation | **OK** | — | Theme is scoped to `.industry-landing[data-industry="…"]`; leaving industry page replaces `#mainContent`, so no leakage. **QA:** Industry page → Home → industry accent no longer applies. |
| Orange not dominating medical/food/janitorial | **OK** | — | **QA:** Medical = blue; food-service/foodservice/food-processing = teal; janitorial = green; industrial/automotive = orange/gray. |

---

## 3. Filtering Correctness

| Issue | Severity | Status | Fix / QA |
|-------|----------|--------|----------|
| ProductGrid defaults to correct industryTag | **OK** | — | Products come from API `/api/seo/industry/:slug` filtered by industry useCase; grid is built from that list. Config `filterDefaults` (materials/thicknesses) are applied and written to URL. **QA:** Medical loads with Nitrile (and optional defaults in URL); janitorial with Nitrile, Vinyl, 4/5/6 mil. |
| QuickPickerBar writes filters to URL | **OK** | — | `industryApplyQuickPickerToUrl()` sets `material` and `thickness` query params and `replaceState`. **QA:** Toggle chips → URL updates; refresh → chips and grid match URL. |
| ProductGrid reads query params and stays in sync | **OK** | — | `industryFilterGridFromParams()` reads `window.__industryProducts` and URL params, filters, re-renders grid. **QA:** Change URL manually to `?material=Nitrile&thickness=5` → chips and grid update (after sync run). |
| Back/forward preserves filters | **OK** | — | **QA:** Set filters → go to Home → Back → industry page re-renders with same slug; `popstate` runs `navigate('industry', { industry })`; URL has params so sync restores chips and grid. |
| Reset to defaults | **Low** | — | No explicit "Reset" button. **QA:** Deselect all chips (or clear query string) to return to unfiltered list. Optional future: add "Clear filters" that clears params and syncs chips. |

---

## 4. UI/UX & Conversion Flows

| Issue | Severity | Status | Fix / QA |
|-------|----------|--------|----------|
| "Shop Now" scrolls to `#shop` | **OK** | — | CTAs use `onclick="document.getElementById('shop')&&document.getElementById('shop').scrollIntoView({behavior:'smooth'})"`. **QA:** Click "Shop Medical Gloves" / "Shop Now" → page scrolls to "Shop gloves" section. |
| Sticky CTA only on mobile, does not cover important UI | **Fixed** | **Fixed** | **Fix:** (1) `.industry-sticky-cta` hidden by default with `opacity:0; visibility:hidden; transform:translateY(100%)`; (2) `.industry-sticky-cta-visible` shows it; (3) JS only adds `industry-sticky-cta-visible` when `scrollY > 400` and `#shop` not in view. Already `display:none` at 769px+. **QA:** Mobile: scroll down past hero → sticky bar appears; scroll so #shop in view → bar hides. Desktop: sticky bar never visible. |
| Bulk pricing CTA opens modal / navigates | **OK** | — | Secondary CTA and sticky "Bulk Pricing" use `navigate('b2b')`. **QA:** Click "Bulk Pricing" → B2B page loads. |
| Forms validate and do not submit empty | **OK** | — | Industry page has no primary form; B2B/contact forms are elsewhere. **QA:** N/A for industry landings. |

---

## 5. Performance

| Issue | Severity | Status | Fix / QA |
|-------|----------|--------|----------|
| Hero images optimized | **Low** | — | Hero uses CSS `background-image: url(...)` (no next/image). **Suggestion:** Use responsive images (e.g. `<picture>` or `image-set`) and ensure hero assets are sized/compressed. **QA:** Check Network tab for hero image size/format. |
| Unnecessary client re-renders | **Fixed** | **Fixed** | **Fix:** Industry scroll handler now removes itself when `#industryStickyCta` is gone (navigate away) and is removed on next industry load to avoid duplicate listeners and null reference. **QA:** Open industry → scroll → go to Home → scroll → no console error; open another industry → scroll → sticky behavior works. |
| No heavy bundles from industry pages | **OK** | — | Industry logic is in existing `app.js`; `industry-config.js` is small. **QA:** No new dynamic imports or large payloads. |

---

## 6. Additional Fixes Applied

- **Scroll handler cleanup:** On entering `renderIndustryPage`, remove any existing `window.__industryScrollHandler` so previous industry page’s listener does not run after DOM replace. Inside the handler, if `#industryStickyCta` is missing, remove the listener and clear `__industryScrollHandler` (avoids throw and leak).
- **404 handling:** Catch block distinguishes 404 (message contains "not found" or "404") and sets title + "Industry Not Found" message.
- **Config slug normalization:** `foodservice` → `food-service`, `manufacturing` → `industrial`, `food-processing` → `food-service` for `window.industryConfig` lookup so all nav slugs get correct copy/hero/CTAs/filter defaults.
- **Sticky CTA visibility:** CSS added for `.industry-sticky-cta-visible` (opacity, visibility, transform) so the bar only appears when scrolled (and hidden when `#shop` in view).
- **Theme tokens for foodservice / manufacturing / food-processing:** `[data-industry="foodservice"]`, `[data-industry="manufacturing"]`, `[data-industry="food-processing"]` added so accent colors apply when those slugs are in the URL.

---

## Regression / Manual QA Checklist

1. **Routing:** Visit `/industries/medical/`, `/industries/foodservice/`, `/industries/unknown/`; confirm medical and foodservice render, unknown shows "Industry Not Found" and correct title.
2. **Nav:** From header Industries dropdown, open each of the 6 links; confirm URL and content match.
3. **Theming:** On medical, janitorial, food-service, check hero/CTA/chip colors are not orange (blue/teal/green as per CSS).
4. **Quick picker:** On an industry page, toggle material/thickness chips; confirm URL updates and grid filters; refresh and confirm state persists.
5. **Back/forward:** Set filters on industry page → go Home → Back; confirm industry page and filters restore.
6. **Shop Now / Bulk:** Click "Shop Now" → scrolls to #shop; click "Bulk Pricing" → B2B page.
7. **Sticky CTA (mobile):** Resize to &lt;768px, open industry, scroll down → sticky bar appears; scroll so shop section in view → bar hides; navigate to Home and scroll → no errors.
8. **No scroll leak:** Open industry → navigate to Products → scroll → no console errors; open industry again → sticky behavior still works.

---

## File Reference

| Area | File |
|------|------|
| Industry render, scroll handler, 404, config slug | `public/js/app.js` (`renderIndustryPage`, `buildIndustryLandingHTML`, `industryApplyQuickPickerToUrl`, `industryFilterGridFromParams`) |
| Industry config (copy, hero, filter defaults) | `public/js/industry-config.js` |
| Industry API (products by useCase) | `server.js` (`SEO_INDUSTRIES`, `GET /api/seo/industry/:slug`) |
| Industry theming, sticky CTA, hero | `public/css/styles.css` (`[data-industry="..."]`, `.industry-sticky-cta`, `.industry-sticky-cta-visible`, etc.) |
| Nav links | `public/index.html` (Industries dropdown) |
