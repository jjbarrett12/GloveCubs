# Customer Portal Gap Audit — GLOVECUBS

## Current State

### Dashboard (`renderDashboardPage()`)

| Section | Status | Notes |
|---------|--------|-------|
| Spend & Savings Stats | ✅ Complete | Total spend, YTD, savings, units |
| Account at a Glance | ✅ Complete | Order count, discount, status, payment terms |
| Tier Progress | ✅ Complete | Progress to next tier |
| Budget Management | ✅ Complete | Set/edit budget with modal |
| Recent Orders | ⚠️ Partial | Only shows 10, no pagination, no detail page |
| Favorites | ✅ Complete | Shows 6, add to cart, remove |
| Saved Lists | ✅ Complete | Add to cart, delete |
| My Quotes (RFQs) | ⚠️ Partial | List only, no detail view, no submit from portal |
| Ship-To Addresses | ✅ Complete | Full CRUD with modal |
| Account Details | ⚠️ Partial | View only, no edit |
| Uploaded Invoices | ❌ Missing | Not in portal (separate page at /invoice-savings) |

### Navigation

| Route | Status | Notes |
|-------|--------|-------|
| `/dashboard` | ✅ Exists | Main portal page |
| `/orders` | ❌ Missing | No dedicated orders page |
| `/orders/:id` | ❌ Missing | No order detail page |
| `/addresses` | ❌ Missing | Inline on dashboard only |
| `/invoices` | ❌ Missing | Not linked from portal |
| `/rfqs` | ❌ Missing | No dedicated RFQ page |
| `/account` | ❌ Missing | No account settings page |

### Sidebar Navigation

Current sidebar links:
- Dashboard (active)
- Shop Products → `/products`
- My Cart → `/cart`
- Bulk Upload → `/cart`
- Logout

Missing from sidebar:
- Orders
- Addresses
- Invoices
- RFQs
- Account Settings

---

## Gap Analysis

### Critical Gaps

1. **No Order Detail Page**
   - Users can only view orders in table or invoice modal
   - No way to see full order items, tracking details
   - No reorder from detail page

2. **No Paginated Orders List**
   - Dashboard shows only 10 orders
   - Companies with many orders can't see history
   - No filtering by status/date

3. **Uploaded Invoices Not in Portal**
   - Feature exists at `/invoice-savings` but not linked
   - Users may not discover it

4. **No RFQ Detail View**
   - Can see list but not details
   - No way to submit new RFQ from portal

### Secondary Gaps

5. **Account Settings Read-Only**
   - Users cannot edit contact info, phone, address

6. **No Portal Sub-Navigation**
   - Everything crammed into single dashboard page
   - Hard to find specific sections

7. **Empty States Could Be Better**
   - Generic text, could have more helpful CTAs

---

## MVP Portal Sections

### Required for MVP

1. **Dashboard** — Overview with quick stats and recent activity
2. **Orders** — Full paginated list with filters
3. **Order Detail** — Complete order info with reorder
4. **Addresses** — Ship-to address management (already works)
5. **Invoices** — Uploaded invoices for cost analysis
6. **RFQs** — Submit and view quote requests
7. **Account** — View/edit basic account info

### Backend Routes Available

| Endpoint | Status | Used By |
|----------|--------|---------|
| `GET /api/orders` | ✅ Ready | Dashboard |
| `GET /api/orders/:id` | ✅ Ready | Invoice modal |
| `POST /api/orders/:id/reorder` | ✅ Ready | Reorder button |
| `GET /api/ship-to` | ✅ Ready | Dashboard |
| `POST/PUT/DELETE /api/ship-to` | ✅ Ready | Dashboard modal |
| `GET /api/invoices` | ✅ Ready | Not linked |
| `POST /api/invoices` | ✅ Ready | Not linked |
| `GET /api/rfqs/mine` | ✅ Ready | Dashboard |
| `POST /api/rfqs` | ✅ Ready | Not in portal |
| `GET /api/account/summary` | ✅ Ready | Dashboard |
| `GET /api/auth/me` | ✅ Ready | Dashboard |

---

## Company-Shared Behavior Verification

| Entity | Ownership | Shared? | Notes |
|--------|-----------|---------|-------|
| Orders | Company-scoped | ✅ Yes | All company users see all orders |
| Ship-To Addresses | Company-scoped | ✅ Yes | Shared across company |
| RFQs | Company-scoped | ✅ Yes | All company users see RFQs |
| Uploaded Invoices | Company-scoped | ✅ Yes | Shared for cost analysis |
| Saved Lists | User-scoped | ❌ No | Intentional for MVP |
| Favorites | User-scoped | ❌ No | Personal preference |
| Cart | User-scoped | ❌ No | Personal workspace |

---

## Implementation Plan

### Phase 1: Navigation & Structure (Immediate)

1. Add portal navigation routes
2. Update sidebar with portal links
3. Add page header with breadcrumbs

### Phase 2: Orders Page (High Priority)

1. Create dedicated orders page with pagination
2. Add status/date filters
3. Add search by order number

### Phase 3: Order Detail Page (High Priority)

1. Full order detail view
2. Line items table
3. Shipping/tracking info
4. Reorder button
5. Invoice download

### Phase 4: RFQ Improvements (Medium)

1. RFQ detail view
2. Submit RFQ form in portal
3. Better status display

### Phase 5: Account Settings (Medium)

1. Edit contact info
2. Change password
3. Notification preferences

---

## Files to Update

| File | Changes |
|------|---------|
| `public/js/app.js` | Add routes, pages, navigation |
| `public/css/styles.css` | Portal page styles |
| `server.js` | Any missing endpoints |

---

## Empty State Improvements

### Current vs Improved

**Orders (Current):**
> "No orders yet. Start shopping"

**Orders (Improved):**
> "No orders yet"
> "Your company's order history will appear here once you place your first order."
> [Browse Products] [Request a Quote]

**RFQs (Current):**
> "No quote requests yet. Use the RFQ form for bulk or custom quotes."

**RFQs (Improved):**
> "No quote requests yet"
> "Need pricing for large quantities or custom specifications? Submit a quote request and our team will respond within 24 hours."
> [Request a Quote]

**Ship-To (Current):**
> "Add multiple ship-to addresses for checkout."

**Ship-To (Improved):**
> "No shipping addresses saved"
> "Save your frequently used shipping locations for faster checkout. Addresses are shared with your team."
> [Add Your First Address]
