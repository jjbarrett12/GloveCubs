# Supplier Portal Intelligence Dashboard

## Overview

The Supplier Portal Dashboard is a supplier-facing intelligence platform that transforms GloveCubs into a supplier performance and competitiveness dashboard. It provides suppliers with actionable insights to improve their data quality, pricing competitiveness, and recommendation rankings.

## Design Goals

- **Enterprise-grade**: Professional appearance with clear data hierarchy
- **Actionable**: Every metric links to specific improvements
- **Motivating**: Highlights opportunities, not just problems
- **Explainable**: All metrics show reasoning and evidence

## Dashboard Sections

### 1. Overview Tab

Key metrics at a glance:
- **Reliability Score**: Overall supplier reliability with trend indicator
- **Avg Trust Score**: Average trust across all offers
- **Active Offers**: Count of active offers
- **Stale Offers**: Offers not updated in 30+ days
- **Avg Rank**: Average recommendation ranking
- **Last Upload**: When the most recent feed was uploaded

Additional components:
- **Latest Upload Summary**: Created/Updated/Skipped counts from last upload
- **Action Items Preview**: Top priority items needing attention
- **Almost Winning**: Products where supplier is rank 2-3 with improvement suggestions

### 2. Feed Health Tab

Upload and data quality metrics:
- **30-Day Uploads**: Number of uploads in last 30 days
- **Avg Error Rate**: Percentage of rows with errors
- **Corrections**: Manual corrections applied
- **Validation Warnings**: Total warning count

Detailed breakdowns:
- **Extraction Confidence Distribution**: Visual breakdown of high/medium/low confidence extractions
- **Field-Level Confidence**: Average confidence per field type
- **Validation Warning Breakdown**: Counts by warning type (price anomaly, pack mismatch, duplicate, low confidence)
- **Most Corrected Fields**: Fields that needed manual correction most often

### 3. Competitiveness Tab

Ranking and market position metrics:
- **Avg Rank**: Average recommendation ranking
- **#1 Rankings**: Products where supplier is recommended first
- **#2-3 Rankings**: Close to winning
- **Low Rank**: Products ranked 4+
- **Low Trust**: Offers with trust score issues

**Near Win Analysis**:
For each product where supplier is rank 2-3:
- Price gap to #1 supplier
- Trust score gap
- Freshness gap (days)
- Blocking factors identified
- Specific improvement suggestions

### 4. Lost Opportunities Tab

Identifies rankings lost due to issues:
- **Low Trust**: Offers with poor trust scores
- **Stale Offers**: Outdated pricing causing rank drops
- **Missing Fields**: Incomplete data hurting quality scores
- **Price Anomalies**: Detected pricing issues

For each opportunity:
- Current rank vs potential rank
- Impact score (0-100)
- Specific reason for loss
- Recommended action

### 5. Action Center Tab

Prioritized action items with:
- **Priority Level**: Critical, High, Medium, Low
- **Category**: Stale, Data Quality, Trust, Pricing
- **Description**: What needs to be fixed
- **Affected Offers**: Number of offers impacted
- **Potential Impact**: Expected improvement from fixing
- **Direct Action Link**: One-click navigation to fix

Common action items:
- Refresh stale offers
- Complete missing product data
- Address low trust offers
- Review price anomalies
- Upload fresh data

### 6. Upload History Tab

Complete upload history showing:
- Filename and upload date
- Status (committed, preview, failed)
- Row counts: total, processed, created, warnings, errors

## API Endpoints

All endpoints require authenticated supplier session via cookie.

| Endpoint | Description |
|----------|-------------|
| `?endpoint=summary` | Basic dashboard summary |
| `?endpoint=upload-metrics` | Feed upload statistics |
| `?endpoint=extraction-confidence` | Confidence distribution |
| `?endpoint=validation-warnings` | Warning counts by type |
| `?endpoint=correction-metrics` | Correction statistics |
| `?endpoint=competitiveness-metrics` | Ranking statistics |
| `?endpoint=lost-opportunities` | Lost ranking opportunities |
| `?endpoint=near-wins` | Close-to-winning products |
| `?endpoint=action-items` | Prioritized actions |
| `?endpoint=upload-history` | Upload history list |

## Service Layer

### dashboardIntelligence.ts

Extended analytics functions:

```typescript
// Upload metrics
getUploadHistory(supplier_id, limit)
getFeedUploadMetrics(supplier_id)

// Feed health
getExtractionConfidenceDistribution(supplier_id)
getValidationWarningCounts(supplier_id)
getCorrectionMetrics(supplier_id)

// Competitiveness
getCompetitivenessMetrics(supplier_id)
getNearWinOpportunities(supplier_id, limit)

// Opportunities
getLostOpportunities(supplier_id, limit)

// Actions
getActionItems(supplier_id)
```

## Security

- **Supplier-Scoped**: All queries filtered by `supplier_id`
- **RLS Enforced**: Database-level row security
- **Session Required**: Cookie-based authentication
- **No Cross-Supplier Visibility**: Suppliers only see their own data
- **Audit Logged**: All actions are logged

## Data Sources

The dashboard aggregates data from:
- `supplier_reliability_scores` - Reliability metrics
- `offer_trust_scores` - Trust scoring
- `supplier_recommendations` - Recommendation rankings
- `supplier_offers` - Offer data and freshness
- `supplier_feed_uploads` - Upload history
- `supplier_feed_upload_rows` - Extraction details
- `ai_pricing_analysis` - Anomaly detection
- `supplier_audit_log` - Correction history

## UI Components

Custom components for consistent visualization:
- `StatCard` - Key metric display with trend
- `PriorityBadge` - Priority level indicator
- `OpportunityTypeBadge` - Lost opportunity type
- `StatusBadge` - Upload status indicator
- `ConfidenceBar` - Visual confidence distribution
- `ImpactBar` - Impact score visualization

## Future Enhancements

1. **Trend Charts**: Time-series visualization of key metrics
2. **Competitor Benchmarking**: Anonymous market position comparison
3. **Email Alerts**: Notifications for critical action items
4. **Goal Setting**: Allow suppliers to set targets
5. **Export Reports**: Download performance reports
6. **Mobile Optimization**: Responsive design improvements
