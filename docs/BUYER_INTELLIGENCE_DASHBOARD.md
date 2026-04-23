# GLOVECUBS Buyer Intelligence Dashboard

## Overview

The Buyer Intelligence Dashboard is the primary interface for institutional customers including hospital systems, school districts, food processors, manufacturers, and janitorial contractors. It transforms procurement intelligence built into the GLOVECUBS platform into actionable insights focused on what matters most to buyers: savings, reliability, risk, and spend optimization.

## Design Philosophy

This dashboard is **not** about internal AI mechanics or supplier feed details. It surfaces:

- **Realized and pipeline savings**
- **Supplier trust comparisons**
- **Procurement risk alerts**
- **Spend analytics**
- **AI-powered recommendations with clear explanations**

The goal: make buyers feel like they have a dedicated procurement intelligence team.

## Dashboard Sections

### 1. Savings Summary

Shows financial impact of the platform:

| Metric | Description |
|--------|-------------|
| Quarter Savings | Total savings realized this quarter |
| YTD Savings | Year-to-date realized savings |
| Pipeline Savings | Estimated savings from pending opportunities |
| Realized Savings | Confirmed savings from accepted recommendations |

**Savings Breakdown:**
- Savings from supplier switches
- Savings from better offers
- Savings from anomaly detection
- Savings from rebid recommendations

**Monthly Trend:** Visual chart of savings over time

### 2. Market Intelligence

For each product the buyer purchases:

| Field | Description |
|-------|-------------|
| Market Low | Lowest price in market |
| Market High | Highest price in market |
| Market Average | Average across all offers |
| Trusted Best Price | Best price from high-trust suppliers |
| Trusted Best Supplier | Supplier offering trusted best price |
| Suspicious Low Count | Number of low-trust suspiciously cheap offers |
| Volatility Band | Price stability indicator (stable/elevated/high_volatility) |

**Price Distribution Chart:** Visual comparison of prices by supplier with trust indicators

### 3. Supplier Trust Comparison

For any product, compare all suppliers:

| Field | Description |
|-------|-------------|
| Supplier Name | Supplier identity |
| Price | Current offer price |
| Price vs Market | Percentage above/below market average |
| Trust Score | 0-100% trust score |
| Trust Band | high_trust / medium_trust / low_trust |
| Reliability Score | Historical reliability percentage |
| Reliability Band | Supplier reliability classification |
| Offer Freshness | Days since last price update |
| Freshness Status | fresh / aging / stale |
| Recommendation Rank | AI-determined ranking |
| Is Recommended | Whether this is the #1 recommendation |

### 4. Procurement Risks

Active risk alerts prioritized by severity:

| Field | Description |
|-------|-------------|
| Type | supplier_decline / price_volatility / stale_offer / margin_compression / coverage_gap |
| Severity | critical / high / medium / low |
| Title | Risk summary |
| Description | Detailed explanation |
| Affected Products | Number of products at risk |
| Affected Spend | Dollar amount at risk |
| Recommended Action | What to do |

**Sources:**
- Procurement alerts
- Supplier deterioration forecasts
- Price volatility forecasts

### 5. Spend Analytics

Comprehensive spend visibility:

| Metric | Description |
|--------|-------------|
| Total Spend | All-time total |
| Period Spend | Spend in selected time window |
| Order Count | Number of orders |
| Average Order Value | Average order size |

**Breakdowns:**
- Spend by Facility (with percentages)
- Spend by Product (top 20)
- Spend by Supplier (top 10)
- Monthly Spend Trend

**Filters:**
- Facility
- Department
- Date range

### 6. Opportunity Engine

Prioritized savings opportunities:

| Field | Description |
|-------|-------------|
| Type | supplier_switch / rebid / consolidate / renegotiate |
| Priority | high / medium / low |
| Product | Affected product |
| Current Supplier | Who you're buying from |
| Current Price | What you're paying |
| Recommended Supplier | Who you should buy from |
| Recommended Price | What you could pay |
| Estimated Savings | Dollar savings potential |
| Savings Percentage | Percentage savings |
| Confidence | AI confidence in recommendation |
| Reasoning | Why this is recommended |

### 7. AI Explanations

For any recommendation, transparent reasoning:

| Section | Description |
|---------|-------------|
| Trust Reasoning | Why we trust this supplier |
| Price Reasoning | Price analysis results |
| Risk Indicators | Any flags or concerns |
| Confidence Factors | What supports this recommendation |
| Alternative Options | Other suppliers with trade-offs |

## API Endpoints

All endpoints are authenticated and buyer-scoped.

```
GET /buyer/api/dashboard?endpoint=summary
GET /buyer/api/dashboard?endpoint=savings
GET /buyer/api/dashboard?endpoint=market-intelligence
GET /buyer/api/dashboard?endpoint=market-intelligence&product_ids=id1,id2
GET /buyer/api/dashboard?endpoint=supplier-comparison&product_id=xxx
GET /buyer/api/dashboard?endpoint=risks
GET /buyer/api/dashboard?endpoint=spend
GET /buyer/api/dashboard?endpoint=spend&facility=xxx&department=xxx&start_date=xxx&end_date=xxx
GET /buyer/api/dashboard?endpoint=opportunities
GET /buyer/api/dashboard?endpoint=supplier-forecasts
GET /buyer/api/dashboard?endpoint=ai-explanation&product_id=xxx
```

## Service Layer

### Core Functions

```typescript
// Dashboard summary for header metrics
getBuyerDashboardSummary(buyer_id: string): Promise<DashboardSummary>

// Savings analytics
getSavingsSummary(buyer_id: string): Promise<SavingsSummary>

// Market intelligence for products
getMarketIntelligence(buyer_id: string, product_ids?: string[]): Promise<MarketIntelligence[]>

// Supplier comparison for a product
getSupplierComparison(buyer_id: string, product_id: string): Promise<SupplierComparison[]>

// Active procurement risks
getProcurementRisks(buyer_id: string): Promise<ProcurementRisk[]>

// Spend analytics with filters
getSpendAnalytics(buyer_id: string, filters?: SpendFilters): Promise<SpendAnalytics>

// Savings opportunities
getSavingsOpportunities(buyer_id: string, limit?: number): Promise<SavingsOpportunity[]>

// Supplier risk forecasts
getSupplierRiskForecasts(buyer_id: string): Promise<SupplierRiskForecast[]>

// AI explanation for recommendations
getAIExplanation(product_id: string): Promise<AIExplanation | null>
```

## Data Sources

The dashboard aggregates from:

| Table | Usage |
|-------|-------|
| recommendation_outcomes | Realized savings, acceptance rates |
| margin_opportunities | Pending savings opportunities |
| supplier_reliability_scores | Supplier reliability metrics |
| offer_trust_scores | Offer trust scores |
| supplier_recommendations | Recommendation rankings |
| procurement_alerts | Active alerts |
| commercial_guidance_recommendations | Rebid/re-source guidance |
| supplier_forecasts | Deterioration predictions |
| price_volatility_forecasts | Price volatility signals |
| orders / order_items | Spend analytics |
| supplier_offers | Current pricing |
| ai_pricing_analysis | Pricing explanations |

## Security

- All data is buyer_id scoped
- Session authentication required
- RLS policies enforce data isolation
- No cross-buyer visibility

## UI Components

### Key Visualizations

1. **MetricCard** - Key metrics with optional trend indicators
2. **SavingsBreakdown** - Categorized savings with proportions
3. **PriceDistributionChart** - Horizontal bar chart with trust indicators
4. **SpendChart** - Stacked bars for spend breakdowns
5. **SeverityBadge** - Color-coded risk severity
6. **TrustBadge** - Color-coded trust band
7. **VolatilityBadge** - Price stability indicator
8. **PriorityBadge** - Opportunity priority

### Color Coding

| Meaning | Color |
|---------|-------|
| Good/Safe/High Trust | Green |
| Neutral/Medium | Blue/Yellow |
| Warning/Low Trust | Orange/Yellow |
| Critical/Danger | Red |

## Files

### Service Layer
- `src/lib/buyer-intelligence/dashboard.ts` - Core service functions
- `src/lib/buyer-intelligence/index.ts` - Module exports

### API
- `src/app/buyer/api/dashboard/route.ts` - API route handler

### UI
- `src/app/buyer/dashboard/page.tsx` - Dashboard page component

## Future Enhancements

1. **Spend Forecasting** - Predict future spend patterns
2. **Contract Renewal Alerts** - Track contract expirations
3. **Benchmark Comparisons** - Compare against similar organizations
4. **Custom Reports** - Exportable reports for stakeholders
5. **Mobile Optimization** - Responsive design improvements
6. **Real-time Notifications** - Push alerts for critical risks
7. **Category Analytics** - Deeper product category insights
8. **Savings Goals** - Set and track savings targets
