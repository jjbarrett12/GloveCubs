# Customer Portal Design

## Overview

The GLOVECUBS customer portal enables B2B buyers to manage their account, view order history, reorder products, manage shipping addresses, download invoices, track shipments, and save favorite products.

---

## Current State Assessment

### Existing Features (Functional)

| Feature | Backend Endpoint | Frontend Location |
|---------|-----------------|-------------------|
| Order History | `GET /api/orders` | Dashboard "Recent Orders" table |
| Order Details | `GET /api/orders/:id` | Order detail view |
| Reorder | `POST /api/orders/:id/reorder` | "Reorder" buttons on dashboard |
| View Invoice (Modal) | `GET /api/orders/:id/invoice` | Invoice modal with print |
| Ship-To CRUD | `GET/POST/PUT/DELETE /api/ship-to` | Dashboard "Ship-To Addresses" section |
| Saved Lists | `GET/POST/PUT/DELETE /api/saved-lists` | Dashboard "Saved Lists" section |
| RFQ History | `GET /api/rfqs/mine` | Dashboard "My Quotes" section |

### Gaps to Address

1. **Invoice PDF Download** — Current endpoint returns JSON for modal display; need downloadable PDF
2. **Enhanced Order Tracking** — Basic tracking link exists; need detailed tracking status display
3. **Favorite Products (Wishlist)** — Saved lists are multi-item; need single-product quick-save feature

---

## Portal UX Design

### Navigation Structure

```
/account
├── /account/dashboard        ← Overview with quick stats
├── /account/orders           ← Full order history with filters
│   └── /account/orders/:id   ← Order detail page
├── /account/addresses        ← Manage ship-to addresses
├── /account/favorites        ← Saved favorite products
├── /account/lists            ← Saved reorder lists (existing)
├── /account/invoices         ← Invoice history & downloads
└── /account/settings         ← Profile, password, notifications
```

### Page Designs

---

#### 1. Dashboard (`/account/dashboard`)

**Purpose:** Quick overview of account activity and shortcuts to common actions.

**Sections:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Welcome back, {first_name}                                     │
│  {company_name} • Account #{customer_id}                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ ORDERS      │  │ PENDING     │  │ SAVED       │             │
│  │ This Month  │  │ SHIPMENTS   │  │ FAVORITES   │             │
│  │    12       │  │     3       │  │    24       │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ── Recent Orders ──────────────────────────────────────────── │
│  [Table: Order #, Date, Status, Total, Actions]                │
│  Actions: [View] [Track] [Invoice ↓] [Reorder]                 │
│                                                                 │
│  ── Quick Actions ──────────────────────────────────────────── │
│  [Reorder Last Order]  [Request Quote]  [Browse Products]      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Data Requirements:**
- Recent 5 orders
- Count of orders this month
- Count of pending shipments (status = 'shipped' or 'processing')
- Count of favorite products

---

#### 2. Order History (`/account/orders`)

**Purpose:** Full searchable/filterable order history.

**Features:**
- Date range filter
- Status filter (All, Processing, Shipped, Delivered, Cancelled)
- Search by order number or product name
- Pagination (25 per page)
- Bulk actions: Download selected invoices

```
┌─────────────────────────────────────────────────────────────────┐
│  Order History                                         [Export] │
├─────────────────────────────────────────────────────────────────┤
│  Filters: [Date Range ▾] [Status ▾] [Search...        ] [Go]   │
├─────────────────────────────────────────────────────────────────┤
│  □  ORDER #      DATE        STATUS      ITEMS   TOTAL   ACTIONS│
│  ─────────────────────────────────────────────────────────────  │
│  □  GC-10042    Mar 1, 2026  Delivered    3     $1,234   ⋯     │
│  □  GC-10038    Feb 28, 2026 Shipped      5     $2,567   ⋯     │
│  □  GC-10035    Feb 25, 2026 Processing   2     $890     ⋯     │
│  ...                                                            │
├─────────────────────────────────────────────────────────────────┤
│  Showing 1-25 of 142 orders            [< Prev] [1] [2] [Next >]│
└─────────────────────────────────────────────────────────────────┘

Actions Menu (⋯):
  • View Order
  • Track Shipment
  • Download Invoice (PDF)
  • Reorder
```

---

#### 3. Order Detail (`/account/orders/:id`)

**Purpose:** Complete order information with line items, shipping, and invoice.

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Orders                                               │
│                                                                 │
│  Order #GC-10042                              [Reorder] [Print] │
│  Placed: March 1, 2026 at 2:34 PM                              │
│  Status: ● Delivered (Mar 3, 2026)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ── Order Items ───────────────────────────────────────────────│
│  ┌──────┬────────────────────────────┬───────┬───────┬────────┐│
│  │ QTY  │ PRODUCT                    │ SKU   │ PRICE │ TOTAL  ││
│  ├──────┼────────────────────────────┼───────┼───────┼────────┤│
│  │ 10   │ Black Nitrile Gloves, L    │ BN-L  │ $12.99│ $129.90││
│  │ 5    │ Blue Nitrile Gloves, M     │ BN-M  │ $11.99│ $59.95 ││
│  │ 2    │ Heavy-Duty Cut Resistant   │ CR-XL │ $24.99│ $49.98 ││
│  └──────┴────────────────────────────┴───────┴───────┴────────┘│
│                                                                 │
│                                    Subtotal:    $239.83        │
│                                    Shipping:    $15.00         │
│                                    Tax:         $19.18         │
│                                    ─────────────────────        │
│                                    Total:       $274.01        │
│                                                                 │
│  ── Shipping Information ──────────────────────────────────────│
│  Ship To:                          Tracking:                   │
│  ABC Industrial Supply             UPS 1Z999AA10123456784      │
│  123 Main Street                   [Track Package →]           │
│  Chicago, IL 60601                                             │
│                                                                 │
│  ── Tracking History ──────────────────────────────────────────│
│  Mar 3, 2026 10:42 AM   ● Delivered - Left at front door      │
│  Mar 3, 2026 8:15 AM    ○ Out for Delivery                    │
│  Mar 2, 2026 6:30 PM    ○ Arrived at Local Facility           │
│  Mar 1, 2026 4:00 PM    ○ Shipped from Warehouse              │
│                                                                 │
│  ── Documents ─────────────────────────────────────────────────│
│  [📄 Download Invoice (PDF)]   [📄 Download Packing Slip]      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

#### 4. Shipping Addresses (`/account/addresses`)

**Purpose:** Manage saved ship-to addresses for faster checkout.

```
┌─────────────────────────────────────────────────────────────────┐
│  Shipping Addresses                             [+ Add Address] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐
│  │ ★ DEFAULT                   │  │                             │
│  │ Main Warehouse              │  │ Chicago Office              │
│  │ 123 Industrial Blvd         │  │ 456 Commerce St, Suite 200  │
│  │ Detroit, MI 48201           │  │ Chicago, IL 60601           │
│  │ (313) 555-0100              │  │ (312) 555-0200              │
│  │                             │  │                             │
│  │ [Edit] [Set Default]        │  │ [Edit] [Set Default] [Delete]
│  └─────────────────────────────┘  └─────────────────────────────┘
│                                                                 │
│  ┌─────────────────────────────┐                               │
│  │ West Coast DC               │                               │
│  │ 789 Distribution Way        │                               │
│  │ Los Angeles, CA 90001       │                               │
│  │ (213) 555-0300              │                               │
│  │                             │                               │
│  │ [Edit] [Set Default] [Delete]                               │
│  └─────────────────────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Address Modal (Add/Edit):**
```
┌────────────────────────────────────────────┐
│  Add Shipping Address                   ✕  │
├────────────────────────────────────────────┤
│  Address Label (optional)                  │
│  [___________________________________]     │
│                                            │
│  Recipient Name *                          │
│  [___________________________________]     │
│                                            │
│  Street Address *                          │
│  [___________________________________]     │
│  [___________________________________]     │
│                                            │
│  City *              State *    ZIP *      │
│  [______________]   [___]    [________]    │
│                                            │
│  Phone                                     │
│  [___________________________________]     │
│                                            │
│  □ Set as default shipping address         │
│                                            │
│  [Cancel]                      [Save]      │
└────────────────────────────────────────────┘
```

---

#### 5. Favorite Products (`/account/favorites`)

**Purpose:** Quick-access list of frequently purchased or saved products.

**Interaction:** Heart icon on product cards/pages to add/remove from favorites.

```
┌─────────────────────────────────────────────────────────────────┐
│  Favorite Products (24 items)                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Sort: Recently Added ▾]                    [Add All to Cart] │
│                                                                 │
│  ┌─────────┐ Black Nitrile Gloves, 6 mil, Large       $12.99   │
│  │  [img]  │ SKU: BN-6MIL-L • In Stock                         │
│  │   ♥     │ [Add to Cart]  [Remove]                           │
│  └─────────┘                                                    │
│                                                                 │
│  ┌─────────┐ Heavy-Duty Cut Resistant Gloves, XL      $24.99   │
│  │  [img]  │ SKU: CR-HD-XL • In Stock                          │
│  │   ♥     │ [Add to Cart]  [Remove]                           │
│  └─────────┘                                                    │
│                                                                 │
│  ┌─────────┐ Latex Exam Gloves, Powder-Free, M        $8.99    │
│  │  [img]  │ SKU: LX-PF-M • Low Stock (12 left)                │
│  │   ♥     │ [Add to Cart]  [Remove]                           │
│  └─────────┘                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

#### 6. Invoice History (`/account/invoices`)

**Purpose:** Access and download invoices for all orders.

```
┌─────────────────────────────────────────────────────────────────┐
│  Invoices                                                       │
├─────────────────────────────────────────────────────────────────┤
│  Filters: [Date Range ▾] [Search order #...     ]              │
├─────────────────────────────────────────────────────────────────┤
│  □  INVOICE #    ORDER #     DATE         AMOUNT    DOWNLOAD   │
│  ─────────────────────────────────────────────────────────────  │
│  □  INV-10042   GC-10042   Mar 1, 2026   $274.01   [PDF ↓]    │
│  □  INV-10038   GC-10038   Feb 28, 2026  $2,567.00 [PDF ↓]    │
│  □  INV-10035   GC-10035   Feb 25, 2026  $890.45   [PDF ↓]    │
│  ...                                                            │
├─────────────────────────────────────────────────────────────────┤
│  [Download Selected]                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend API Endpoints

### Existing Endpoints (No Changes Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders for authenticated user's company |
| GET | `/api/orders/:id` | Get order details |
| POST | `/api/orders/:id/reorder` | Add order items to cart |
| GET | `/api/ship-to` | List shipping addresses |
| POST | `/api/ship-to` | Create shipping address |
| PUT | `/api/ship-to/:id` | Update shipping address |
| DELETE | `/api/ship-to/:id` | Delete shipping address |
| GET | `/api/saved-lists` | List saved product lists |

### New Endpoints Required

---

#### 1. Invoice PDF Download

**Endpoint:** `GET /api/orders/:id/invoice/pdf`

**Purpose:** Generate and return a downloadable PDF invoice.

**Response:**
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="invoice-GC-10042.pdf"`

**Implementation Notes:**
- Use `pdfkit` or `puppeteer` to generate PDF from invoice data
- Include company letterhead, order details, line items, totals
- Cache generated PDFs for repeat downloads

**Request:**
```
GET /api/orders/10042/invoice/pdf
Authorization: Bearer {token}
```

**Response:** Binary PDF stream

---

#### 2. Order Tracking Details

**Endpoint:** `GET /api/orders/:id/tracking`

**Purpose:** Fetch detailed tracking information for an order's shipment.

**Response:**
```json
{
  "order_id": 10042,
  "carrier": "UPS",
  "tracking_number": "1Z999AA10123456784",
  "tracking_url": "https://www.ups.com/track?tracknum=1Z999AA10123456784",
  "status": "delivered",
  "estimated_delivery": "2026-03-03",
  "actual_delivery": "2026-03-03T10:42:00Z",
  "events": [
    {
      "timestamp": "2026-03-03T10:42:00Z",
      "status": "Delivered",
      "location": "Chicago, IL",
      "description": "Left at front door"
    },
    {
      "timestamp": "2026-03-03T08:15:00Z",
      "status": "Out for Delivery",
      "location": "Chicago, IL",
      "description": "On vehicle for delivery"
    },
    {
      "timestamp": "2026-03-02T18:30:00Z",
      "status": "In Transit",
      "location": "Chicago, IL",
      "description": "Arrived at local facility"
    },
    {
      "timestamp": "2026-03-01T16:00:00Z",
      "status": "Shipped",
      "location": "Detroit, MI",
      "description": "Shipment picked up"
    }
  ]
}
```

**Implementation Notes:**
- For MVP: Return stored tracking data from `orders` table
- Future: Integrate with carrier APIs (UPS, FedEx, USPS) for real-time tracking
- Consider webhook integration for carrier status updates

---

#### 3. Product Favorites (Wishlist)

**New Schema:**

```sql
CREATE TABLE public.product_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX idx_product_favorites_user ON public.product_favorites(user_id);
```

**Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/favorites` | List user's favorite products |
| POST | `/api/favorites` | Add product to favorites |
| DELETE | `/api/favorites/:productId` | Remove product from favorites |
| GET | `/api/products/:id/favorite` | Check if product is favorited |

**GET /api/favorites**

Response:
```json
{
  "favorites": [
    {
      "id": 1,
      "product_id": 42,
      "product": {
        "id": 42,
        "name": "Black Nitrile Gloves, 6 mil, Large",
        "sku": "BN-6MIL-L",
        "price": 12.99,
        "stock": 500,
        "image_url": "/images/products/bn-6mil-l.jpg"
      },
      "created_at": "2026-02-15T10:30:00Z"
    }
  ],
  "count": 24
}
```

**POST /api/favorites**

Request:
```json
{
  "product_id": 42
}
```

Response:
```json
{
  "id": 1,
  "product_id": 42,
  "created_at": "2026-03-01T14:00:00Z"
}
```

**DELETE /api/favorites/:productId**

Response: `204 No Content`

---

#### 4. Account Summary (Dashboard Stats)

**Endpoint:** `GET /api/account/dashboard`

**Purpose:** Aggregate stats for dashboard widgets.

**Response:**
```json
{
  "orders_this_month": 12,
  "pending_shipments": 3,
  "favorites_count": 24,
  "recent_orders": [
    {
      "id": 10042,
      "order_number": "GC-10042",
      "created_at": "2026-03-01T14:34:00Z",
      "status": "delivered",
      "total": 274.01,
      "item_count": 3,
      "tracking_number": "1Z999AA10123456784"
    }
  ],
  "account": {
    "company_name": "ABC Industrial Supply",
    "customer_id": "CUST-1001",
    "pricing_tier": "volume_discount"
  }
}
```

---

#### 5. Order History with Filters

**Endpoint:** `GET /api/orders` (enhanced)

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 25, max: 100) |
| `status` | string | Filter by status (processing, shipped, delivered, cancelled) |
| `from` | date | Start date (ISO 8601) |
| `to` | date | End date (ISO 8601) |
| `search` | string | Search order number or product name |

**Example:**
```
GET /api/orders?page=1&limit=25&status=shipped&from=2026-02-01&to=2026-02-28
```

**Response:**
```json
{
  "orders": [...],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 142,
    "pages": 6
  }
}
```

---

## Schema Changes Required

### 1. Product Favorites Table

```sql
-- Migration: 20260302000010_product_favorites.sql

CREATE TABLE IF NOT EXISTS public.product_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX idx_product_favorites_user ON public.product_favorites(user_id);
CREATE INDEX idx_product_favorites_product ON public.product_favorites(product_id);
```

### 2. Order Tracking Fields (Optional Enhancement)

```sql
-- Add to orders table if not present
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carrier VARCHAR(50),
  ADD COLUMN IF NOT EXISTS estimated_delivery DATE,
  ADD COLUMN IF NOT EXISTS actual_delivery TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_events JSONB DEFAULT '[]';
```

---

## Implementation Priority

### Phase 1: Core Portal (MVP)

1. **Dashboard page** with existing order data and stats
2. **Order history** with basic filtering
3. **Order detail** page with line items
4. **Shipping address** management (already exists, ensure UI polish)
5. **Invoice modal** improvements (existing, polish print styling)

### Phase 2: Downloads & Tracking

6. **Invoice PDF generation** endpoint
7. **Invoice download** buttons in UI
8. **Tracking detail** display on order page
9. **Carrier tracking** link integration

### Phase 3: Favorites & Enhancements

10. **Product favorites** schema and endpoints
11. **Heart icon** on product cards
12. **Favorites page** in portal
13. **Order search** by product name
14. **Bulk invoice download**

---

## Frontend Implementation Notes

### State Management

For the SPA dashboard in `app.js`, add these data fetching functions:

```javascript
async function fetchDashboardStats() {
  const res = await fetch('/api/account/dashboard', authHeaders());
  return res.json();
}

async function fetchOrdersFiltered(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/orders?${query}`, authHeaders());
  return res.json();
}

async function fetchOrderTracking(orderId) {
  const res = await fetch(`/api/orders/${orderId}/tracking`, authHeaders());
  return res.json();
}

async function downloadInvoicePdf(orderId) {
  const res = await fetch(`/api/orders/${orderId}/invoice/pdf`, authHeaders());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${orderId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

async function toggleFavorite(productId, isFavorited) {
  if (isFavorited) {
    await fetch(`/api/favorites/${productId}`, { method: 'DELETE', ...authHeaders() });
  } else {
    await fetch('/api/favorites', { 
      method: 'POST', 
      body: JSON.stringify({ product_id: productId }),
      ...authHeaders()
    });
  }
}
```

### Heart Icon Component

Add to product cards:

```html
<button class="favorite-btn" onclick="toggleFavorite(${product.id}, ${product.is_favorited})">
  ${product.is_favorited ? '♥' : '♡'}
</button>
```

---

## Security Considerations

1. **All endpoints require authentication** via JWT middleware
2. **Company-scoped access** — users can only access orders/invoices for their company
3. **Rate limiting** on PDF generation to prevent abuse
4. **Input validation** on all filter parameters
5. **PDF generation** should not allow arbitrary HTML injection

---

## Summary

| Feature | Status | Backend Work | Frontend Work |
|---------|--------|--------------|---------------|
| View order history | ✅ Complete | Pagination/filters added | Updated UI |
| Reorder | ✅ Complete | None needed | None needed |
| Manage addresses | ✅ Complete | None needed | None needed |
| View invoice (modal) | ✅ Complete | None needed | None needed |
| Download invoice | ✅ Complete | PDF/HTML endpoint added | Download buttons |
| Track order status | ✅ Complete | Tracking endpoint added | Status in UI |
| Save favorites | ✅ Complete | New table + endpoints | Heart icons + section |

---

## Implementation Complete

### Files Changed

**Schema:**
- `supabase/migrations/20260302000010_product_favorites.sql` — New favorites table + order tracking fields

**Backend (`server.js`):**
- `GET /api/favorites` — List user's favorite products
- `POST /api/favorites` — Add product to favorites
- `DELETE /api/favorites/:productId` — Remove from favorites
- `GET /api/products/:id/favorite` — Check if favorited
- `GET /api/orders/:id/invoice/pdf` — Download invoice as HTML
- `GET /api/orders/:id/tracking` — Get tracking details
- `GET /api/account/dashboard` — Dashboard aggregate stats
- `GET /api/orders` — Enhanced with pagination, status/date filters, search

**Frontend (`public/js/app.js`):**
- Dashboard now fetches and displays favorites section
- Heart icon buttons on product cards (`toggleFavorite()`)
- Invoice download button in modal and order table
- `downloadInvoicePdf()`, `addFavoriteToCart()`, `removeFavorite()` functions
- Order table shows icon buttons for actions

**Styles (`public/css/styles.css`):**
- Favorite button styles (heart icon, favorited state)
- Favorites grid layout for dashboard
