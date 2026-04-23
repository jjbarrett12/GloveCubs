# Product Catalog Verification Audit

This document describes the product catalog audit process for GLOVECUBS launch readiness.

## Quick Start

```bash
# Run audit against database
node scripts/audit-product-catalog.js

# Show remediation list
node scripts/audit-product-catalog.js --remediation

# Show all products with scores
node scripts/audit-product-catalog.js --detailed

# Export to JSON
node scripts/audit-product-catalog.js --json > reports/catalog-audit.json

# Analyze from JSON file (offline)
node scripts/audit-product-catalog.js --file=products.json
```

## Launch-Ready Criteria

A product is considered **launch-ready** if it has ALL of the following:

| Field | Requirement |
|-------|-------------|
| `name` | Non-empty string |
| `price` | Greater than $0 |
| `image_url` | Valid URL (5+ characters) |
| `description` | At least 10 characters |
| `category` | Non-empty string |

## Completeness Score

Each product receives a completeness score (0-100%) based on:

### Required Fields (70% weight)
- Name
- Price (> $0)
- Image URL (valid format)
- Description (50+ chars for full credit)
- Category

### Recommended Fields (30% weight)
- Brand
- Material
- SKU
- Sizes
- Pack quantity

## Recommended Minimums for Launch

| Metric | Minimum | Rationale |
|--------|---------|-----------|
| Launch-ready products | 50+ | Sufficient catalog variety |
| Categories | 3+ | Organized browsing experience |
| Completeness | 70%+ | Quality customer experience |

## Report Sections

### Summary
- Total product count
- Launch-ready vs incomplete
- Average completeness score

### Field Coverage
- Percentage of products with each field populated
- Identifies gaps in data entry

### Quality Issues
- Missing images
- Invalid image URLs
- Zero/missing prices
- Short descriptions
- Missing categories

### Categories
- List of unique categories
- Helps identify catalog organization

### Launch Readiness Assessment
- Pass/fail for each criterion
- Overall launch recommendation

### Remediation List
- Products missing price
- Products missing image
- Products missing description
- Products missing category
- Lowest-scoring products (priority fix)

## Sample Output

```
╔════════════════════════════════════════════════════════════════════╗
║           GLOVECUBS PRODUCT CATALOG AUDIT REPORT                   ║
╠════════════════════════════════════════════════════════════════════╣
║  Generated: 2026-03-02 14:30:00                                    ║
╚════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────┐
│                        SUMMARY                                      │
├─────────────────────────────────────────────────────────────────────┤
│  Total Products:           150                                      │
│  Launch-Ready:             120  ( 80%)                              │
│  Incomplete:                30  ( 20%)                              │
│  Average Score:             85%                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                 LAUNCH READINESS ASSESSMENT                         │
├─────────────────────────────────────────────────────────────────────┤
│  Min Products (50):     ✓ PASS (120 launch-ready)                   │
│  Min Categories (3):    ✓ PASS (5 categories)                       │
│  70% Complete:          ✓ PASS (80% launch-ready)                   │
├─────────────────────────────────────────────────────────────────────┤
│  OVERALL:               ✓ READY FOR LAUNCH                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Remediation Workflow

1. **Run audit** to identify issues
2. **Export remediation list** (`--json --remediation`)
3. **Prioritize** by:
   - Missing prices (blocks sales)
   - Missing images (impacts conversions)
   - Missing descriptions (affects SEO/search)
   - Missing categories (affects navigation)
4. **Batch update** products in admin panel
5. **Re-run audit** to verify fixes

## API Integration

The audit can also be triggered via API for automated monitoring:

```javascript
// In server.js - admin route for catalog audit
app.get('/api/admin/catalog/audit', authenticateToken, requireAdmin, async (req, res) => {
  const { products } = await productsService.getProducts({ limit: 10000 });
  const { stats, remediation } = analyzeProducts(products);
  res.json({
    summary: stats,
    remediation: req.query.remediation === 'true' ? remediation : undefined
  });
});
```

## Environment Variables

```bash
# Required for database access
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Files

| File | Description |
|------|-------------|
| `scripts/audit-product-catalog.js` | Audit script |
| `docs/PRODUCT_CATALOG_AUDIT.md` | This documentation |
| `data/products-export.json` | Exported products (if --export used) |
