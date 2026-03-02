# Category Rename: Work Gloves → Reusable Work Gloves

Display label "Reusable Work Gloves" is used site-wide; internal filter/API value remains "Work Gloves" for compatibility.

---

## 1. Copy & display

- **`getCategoryDisplayName(category)`** (app.js): maps `"Work Gloves"` → `"Reusable Work Gloves"` for all user-facing text.
- **Footer** (footerLinks.js): Quick Links label = "Reusable Work Gloves"; href/segment unchanged (`work-gloves`).
- **Products sidebar**: Radio `value="Work Gloves"` (for API), visible label "Reusable Work Gloves".
- **Category page**: H1 and breadcrumb use `getCategoryDisplayName(state.filters.category)` → "Reusable Work Gloves".
- **Product detail breadcrumb**: Category link text uses `getCategoryDisplayName(product.category)`.
- **Home category cards**: Second card title "Reusable Work Gloves"; `filterByCategory('Work Gloves')` unchanged.
- **Admin/Edit**: Dropdown option value "Work Gloves", label "Reusable Work Gloves".

---

## 2. Layout & CSS (no regression)

### Navigation (desktop 1440px)
- Header nav items already use `white-space: nowrap`; no "Reusable Work Gloves" in main nav. No change.

### Footer
- **Quick Links column**: `min-width: 180px` so "Reusable Work Gloves" fits on one line at 1440px and 1024px.
- **Mobile (≤576px)**: `min-width: 0` so single-column layout stays flexible.

### Category page
- **H1** (`.shop-header-title`): `line-height: 1.28`, `word-wrap: break-word` so a two-line "Reusable Work Gloves" matches "Disposable Gloves" in hierarchy.
- **Breadcrumb** (`.shop-page-breadcrumb`): `word-wrap: break-word` for long category name.
- **Responsive**: At 1024px H1 22px; at 576px H1 20px (unchanged).

### Sidebar filter (products page)
- **`.filter-option span`**: `min-width: 0` and `word-wrap: break-word` so "Reusable Work Gloves" wraps cleanly in the sidebar on tablet/mobile without breaking the row.

### Mobile
- Nav: Stacked menu; no category name in main nav.
- Footer: Single column; link text wraps if needed.
- Dropdowns: Filter options in sidebar handle long label via flex + word-wrap.

---

## 3. Breakpoints checked

| Width        | Status |
|-------------|--------|
| 1440px      | Footer Quick Links 180px min; nav nowrap; category H1 one line or two with same weight as Disposable. |
| 1024px      | Footer 2-col; Quick Links column ≥180px; shop H1 22px. |
| 768px       | Footer 2-col; filter sidebar "Reusable Work Gloves" wraps in option. |
| Mobile (576px) | Footer 1-col; shop H1 20px; filter option wraps. |

---

## 4. Visual balance

- Same font size and weight for "Disposable Gloves" and "Reusable Work Gloves" in:
  - Category page H1
  - Sidebar filter options
  - Home category cards
- No extra shrinking or truncation; spacing and rhythm unchanged.
