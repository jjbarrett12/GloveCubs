# GloveCubs Supplier Portal

## Overview

The Supplier Portal is a secure interface that allows suppliers to manage their presence in the GloveCubs marketplace. It provides visibility into reliability scores, trust metrics, pricing competitiveness, and actionable alerts to help suppliers improve their rankings.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUPPLIER PORTAL                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  AUTHENTICATION                          │    │
│  │  • Session-based auth with HTTP-only cookies             │    │
│  │  • Password hashing with salt                            │    │
│  │  • supplier_id scoped sessions                           │    │
│  │  • Full audit logging                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    DASHBOARD                              │    │
│  │  • Reliability Score    • Trust Scores                   │    │
│  │  • Offer Counts         • Rank Distribution              │    │
│  │  • Alert Summary        • Rejection Stats                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 OFFER MANAGEMENT                          │    │
│  │  • Create / Edit offers • Case pack details              │    │
│  │  • Bulk price updates   • Lead times & MOQ               │    │
│  │  • Deactivate/Reactivate • Bulk CSV upload               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐  │
│  │   FEED HEALTH   │    │ COMPETITIVENESS │    │   ALERTS    │  │
│  │  • Completeness │    │ • Price %ile    │    │ • Critical  │  │
│  │  • Accuracy     │    │ • Rank Dist     │    │ • Warnings  │  │
│  │  • Anomalies    │    │ • Market Pos    │    │ • Info      │  │
│  └─────────────────┘    └─────────────────┘    └─────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Security

### Authentication

| Feature | Implementation |
|---------|----------------|
| Password Storage | SHA-256 with random salt |
| Sessions | Token-based with 24hr expiry |
| Session Storage | HTTP-only, secure, sameSite cookies |
| RLS | All queries scoped to `supplier_id` |
| Audit Log | Every action logged with IP and user agent |

### Row Level Security

All supplier portal tables have RLS policies enforced:

```sql
-- Example: Suppliers can only see their own data
CREATE POLICY supplier_offers_portal_select ON catalogos.supplier_offers
  FOR SELECT USING (supplier_id = catalogos.get_current_supplier_id());
```

The `get_current_supplier_id()` function reads from the session context, ensuring complete data isolation between suppliers.

### Audit Trail

Every action is logged to `supplier_audit_log`:

| Column | Description |
|--------|-------------|
| supplier_id | The supplier performing the action |
| user_id | The specific user account |
| action | Action type (login, update_offer, etc.) |
| entity_type | What was modified |
| entity_id | Specific record ID |
| changes | JSON diff of changes |
| ip_address | Client IP |
| user_agent | Browser info |
| created_at | Timestamp |

## Pages

### Login (`/supplier-portal/login`)

Simple email/password login form. Creates session cookie on success.

### Dashboard (`/supplier-portal/dashboard`)

**Key Metrics:**
- Reliability Score with trend indicator
- Average Trust Score
- Active/Stale offer counts
- Average recommendation rank
- Price position vs market

**Tabs:**
- **Offer Health**: Shows offers with freshness, trust, and rank status
- **Rejections**: Shows recommendation acceptance/rejection statistics

### Offers (`/supplier-portal/offers`)

Full CRUD for supplier offers:

| Feature | Description |
|---------|-------------|
| List Offers | Filterable by active/stale, searchable by SKU |
| Edit Offer | Update price, case pack, box qty, lead time, MOQ, shipping notes |
| Add New | Search for products, create new offers |
| Bulk Update | Update multiple prices at once |
| Deactivate/Reactivate | Toggle offer visibility |

### Competitiveness (`/supplier-portal/competitiveness`)

**Summary Cards:**
- #1 ranking count
- Average price position
- Competitive prices count

**Rank Distribution Chart:**
- Visual breakdown of rank positions over 30 days

**Product Insights:**
- Per-product price position visualization
- Comparison to market average and minimum
- Current recommendation rank

### Feed Health (`/supplier-portal/feed-health`)

**Score Gauges:**
- Data Completeness percentage
- Data Accuracy percentage

**Field Completion:**
- Status of required fields (case_pack, box_qty, lead_time, moq)

**Quality Issues:**
- Anomaly count
- Correction count
- Recent anomaly list

### Alerts (`/supplier-portal/alerts`)

**Summary Cards:**
- Unread count
- Critical/Warning/Info counts

**Alert Types:**

| Type | Description |
|------|-------------|
| reliability_deterioration | Reliability score declining |
| stale_offers | Offers not updated in 30+ days |
| price_volatility | Pricing instability detected |
| lost_recommendation_rank | Lost #1 position on products |
| low_trust_offers | Offers flagged as low trust |
| feed_quality_issue | Data completeness problems |
| anomaly_detected | Pricing anomalies flagged |
| competitive_pressure | Market pressure indicators |

## API Routes

### `/supplier-portal/api/auth`

| Action | Method | Description |
|--------|--------|-------------|
| login | POST | Authenticate and create session |
| logout | POST | End session |
| validate | POST | Check session validity |

### `/supplier-portal/api/dashboard`

| Endpoint | Method | Description |
|----------|--------|-------------|
| summary | GET | Dashboard overview data |
| offer-health | GET | Offer freshness and trust data |
| competitiveness | GET | Price position insights |
| rank-distribution | GET | Rank distribution over time |
| feed-health | GET | Feed quality metrics |
| rejection-stats | GET | Recommendation outcomes |

### `/supplier-portal/api/offers`

| Action | Method | Description |
|--------|--------|-------------|
| list | GET | List offers with filters |
| get | GET | Get single offer |
| search-products | GET | Search products for new offers |
| create | POST | Create new offer |
| update | POST | Update existing offer |
| bulk-update-prices | POST | Update multiple prices |
| deactivate | POST | Deactivate offer |
| reactivate | POST | Reactivate offer |
| bulk-upload | POST | Upload CSV of offers |

### `/supplier-portal/api/alerts`

| Action | Method | Description |
|--------|--------|-------------|
| list | GET | List alerts with filters |
| counts | GET | Get alert counts by severity |
| mark-read | POST | Mark single alert as read |
| mark-all-read | POST | Mark all alerts as read |
| dismiss | POST | Dismiss an alert |

## Database Schema

### New Tables

| Table | Purpose |
|-------|---------|
| supplier_users | Portal user accounts |
| supplier_sessions | Active sessions |
| supplier_audit_log | Action audit trail |
| supplier_portal_alerts | Supplier-facing alerts |
| supplier_portal_metrics | Cached dashboard metrics |

### Views

| View | Purpose |
|------|---------|
| supplier_dashboard_summary | Pre-aggregated dashboard data |
| supplier_offer_health | Offer freshness and trust |
| supplier_competitiveness | Price position and rankings |

### Functions

| Function | Purpose |
|----------|---------|
| get_current_supplier_id() | RLS helper for session context |
| get_supplier_price_percentile() | Calculate price position |
| get_supplier_rank_distribution() | Rank distribution stats |
| generate_supplier_portal_alerts() | Generate alerts for supplier |
| cleanup_expired_supplier_sessions() | Session cleanup |

## Files Created

### Database Migration
- `supabase/migrations/20260311000011_supplier_portal.sql`

### Services
- `src/lib/supplier-portal/index.ts`
- `src/lib/supplier-portal/auth.ts`
- `src/lib/supplier-portal/dashboard.ts`
- `src/lib/supplier-portal/offers.ts`
- `src/lib/supplier-portal/alerts.ts`

### API Routes
- `src/app/supplier-portal/api/auth/route.ts`
- `src/app/supplier-portal/api/dashboard/route.ts`
- `src/app/supplier-portal/api/offers/route.ts`
- `src/app/supplier-portal/api/alerts/route.ts`

### Pages
- `src/app/supplier-portal/login/page.tsx`
- `src/app/supplier-portal/dashboard/page.tsx`
- `src/app/supplier-portal/offers/page.tsx`
- `src/app/supplier-portal/competitiveness/page.tsx`
- `src/app/supplier-portal/feed-health/page.tsx`
- `src/app/supplier-portal/alerts/page.tsx`

### Modified
- `src/components/ui/dialog.tsx` - Added DialogFooter component

## Design Goals

The portal is designed to **motivate suppliers to improve their data quality and pricing**:

1. **Transparency**: Suppliers see exactly how they're scored
2. **Actionable Insights**: Clear actions to improve rankings
3. **Competitive Awareness**: Price position relative to market
4. **Proactive Alerts**: Issues surfaced before they hurt rankings
5. **Easy Updates**: Simple offer management with bulk operations

## Future Enhancements

1. **Password Reset Flow**: Email-based password recovery
2. **Two-Factor Auth**: Optional 2FA for security
3. **Bulk CSV Import**: Enhanced CSV upload with validation
4. **API Access**: Programmatic API for larger suppliers
5. **Historical Charts**: Trend visualization over time
6. **Competitor Benchmarking**: Anonymous market comparisons
