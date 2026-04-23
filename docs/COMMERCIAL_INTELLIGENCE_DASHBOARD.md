# Commercial Intelligence Dashboard

## Overview

The Commercial Intelligence Dashboard (`/admin/intelligence`) is the daily command center for GloveCubs operators. It aggregates all procurement intelligence, forecasting, and commercial guidance into a single actionable view.

## Design Goals

1. **Fast Scanning** - Key numbers visible at a glance
2. **Strong Prioritization** - Critical items surface first
3. **Evidence Visible** - Reasoning and confidence shown
4. **Clear Actions** - Operators know what to do today

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                COMMERCIAL INTELLIGENCE DASHBOARD                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 HEADER / STATUS BAR                       │    │
│  │  • Critical count badge                                  │    │
│  │  • Risky suppliers badge                                 │    │
│  │  • Major savings badge                                   │    │
│  │  • Refresh button                                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      TAB BAR                              │    │
│  │  Overview | Suppliers | Opportunities | Stability |      │    │
│  │  Forecasts | Alerts | Metrics                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────────────────┐    │
│  │  TODAY'S           │  │  SECTION-SPECIFIC CONTENT      │    │
│  │  PRIORITIES        │  │                                │    │
│  │  • Critical        │  │  Changes based on selected     │    │
│  │  • Risky suppliers │  │  tab                           │    │
│  │  • Savings         │  │                                │    │
│  │  • Rebid needed    │  │                                │    │
│  └────────────────────┘  └────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Tabs / Sections

### Overview

The default landing view showing:

**Today's Priorities** (left column):
- Critical actions required (red)
- Risky suppliers to review (orange)
- Major savings opportunities (green)
- Products needing rebid (yellow)

**Supplier Health Summary**:
- 2x2 grid: Risky, Watch, Stable, Trusted counts

**Performance Snapshot** (right column):
- Acceptance rate percentage
- Total realized savings

**Recent Alerts**:
- Top 4 most recent alerts with severity badges

### Supplier Health

Focused view of supplier reliability and trust:

**Summary Stats**:
| Metric | Description |
|--------|-------------|
| Risky Suppliers | Count in "risky" band |
| Watch List | Count in "watch" band |
| Deteriorating | Suppliers with declining forecasts |
| Total Tracked | All monitored suppliers |

**Requires Attention Panel** (red border):
- Risky and deteriorating suppliers
- Reliability score and band
- Forecast direction indicator
- Active alert count

**Trust Leaderboard**:
- Top 5 suppliers by trust score
- Ranked with visual indicators

### Margin Opportunities

Savings potential across the catalog:

**Summary Stats**:
| Metric | Description |
|--------|-------------|
| Major Opportunities | Count in "major" band |
| Est. Total Savings | Sum of estimated savings |
| Avg Savings % | Average percentage savings |

**Top Savings Opportunities**:
- Product name and band
- Estimated savings ($ and %)
- Current vs best trusted price
- Reasoning explanation

### Market Stability

Price volatility and market conditions:

**Summary Stats**:
| Metric | Description |
|--------|-------------|
| High Volatility | Products in high volatility band |
| Elevated | Products in elevated band |
| Stable Products | Products with stable pricing |

**Highest Volatility Products**:
- Product name
- Volatility band and score
- Direction indicator (increasing/stable/decreasing)

### Forecasts

Forward-looking predictions and guidance:

**Summary Stats**:
| Metric | Description |
|--------|-------------|
| Suppliers at Risk | High-risk forecast count |
| Products Need Rebid | Rebid guidance count |
| Total Guidance | Active guidance items |

**Urgent Action Required** (red panel):
- Urgent guidance items
- Title and summary
- Priority indicator bars
- Recommended action

**Supplier Deterioration Forecasts**:
- Direction indicator
- Supplier name
- Forecast band
- Confidence percentage

### Alerts

Active procurement alerts requiring attention:

**Summary Stats**:
| Metric | Description |
|--------|-------------|
| Critical | Critical severity count |
| High Priority | High severity count |
| Total Open | All open alerts |

**Active Alerts List**:
- Severity badge
- Alert type badge
- Priority indicator
- Title and summary
- Creation date

### Metrics

Performance measurement and tracking:

**Key Performance Metrics** (large cards):
| Metric | Description |
|--------|-------------|
| Acceptance Rate | % of recommendations accepted |
| Savings Capture | % of estimated savings realized |
| Total Realized Savings | Dollar amount saved |
| Forecast Precision | Accuracy of predictions |

**Supplier Reliability Distribution**:
- Horizontal stacked bar chart
- Trusted (green) → Stable (blue) → Watch (yellow) → Risky (red)

**Recommendation Outcomes**:
- Accepted count (green)
- Rejected count (red)
- Total count (blue)

## Visual Components

### Badge Types

| Type | Values | Purpose |
|------|--------|---------|
| Reliability | trusted, stable, watch, risky | Supplier reliability |
| Opportunity | major, meaningful, minor, none | Savings potential |
| Volatility | high_volatility, elevated, stable, low_signal | Price stability |
| Guidance | urgent, high, moderate, low | Action priority |
| Risk | critical, high, moderate, low | Risk level |
| Severity | critical, high, normal, low | Alert severity |

### Direction Indicator

| Direction | Symbol | Color | Meaning |
|-----------|--------|-------|---------|
| deteriorating | ↓ | Red | Getting worse |
| increasing | ↑ | Red | Volatility rising |
| stable | → | Gray | No change |
| improving | ↑ | Green | Getting better |
| decreasing | ↓ | Green | Volatility falling |
| insufficient_signal | ? | Light gray | Not enough data |

### Priority Indicator

5-bar visualization:
- 4-5 bars filled: Red (critical)
- 3 bars filled: Orange (high)
- 1-2 bars filled: Yellow (moderate)

### Stat Cards

Properties:
- `title`: Metric name
- `value`: Primary number
- `subtitle`: Supporting context
- `trend`: Optional change indicator
- `color`: default, green, yellow, red, blue
- `size`: normal, large

## Data Sources

| Section | Source Tables/Views |
|---------|---------------------|
| Supplier Health | supplier_reliability_scores, suppliers_likely_to_deteriorate |
| Margin Opportunities | margin_opportunities |
| Market Stability | products_rising_volatility |
| Forecasts | suppliers_likely_to_deteriorate, urgent_commercial_guidance |
| Alerts | procurement_alerts |
| Metrics | recommendation_outcomes, forecast_quality_metrics |

## File Location

- **Page**: `src/app/admin/intelligence/page.tsx`
- **Route**: `/admin/intelligence`

## Usage Patterns

### Morning Review

1. Check **Overview** tab for today's priorities
2. Review any **Critical** badges in header
3. Address urgent guidance items
4. Check supplier health if risky count > 0

### Weekly Planning

1. Review **Metrics** tab for trend analysis
2. Check **Forecasts** for upcoming issues
3. Review **Opportunities** for savings planning
4. Monitor **Stability** for rebid candidates

### Issue Investigation

1. Use **Alerts** tab to see all open items
2. Drill into **Supplier Health** for specific suppliers
3. Check **Forecasts** for predicted trajectory
4. Cross-reference with **Stability** data

## Future Enhancements

1. **Time Range Selector**: 7d, 30d, 90d views
2. **Export**: Download dashboard as PDF/CSV
3. **Drill-down**: Click to navigate to detail pages
4. **Notifications**: Push alerts for critical items
5. **Comparisons**: Period-over-period analysis
6. **Custom Views**: Operator-specific dashboards
