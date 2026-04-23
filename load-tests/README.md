# GLOVECUBS Load Testing Harness

Production-oriented load and stress testing using [k6](https://k6.io/).

## Prerequisites

### Install k6

**Windows (Chocolatey):**
```powershell
choco install k6
```

**Windows (Winget):**
```powershell
winget install k6
```

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### Verify Installation
```bash
k6 version
```

## Required Seed Data

Before running load tests, ensure the following test data exists:

### 1. Test Users

Create these users in your database:

```sql
-- Buyer test user
INSERT INTO users (email, password_hash, company_name, contact_name, is_approved)
VALUES ('loadtest@glovecubs.com', '<bcrypt_hash>', 'LoadTest Company', 'Load Tester', 1);

-- Admin test user  
INSERT INTO users (email, password_hash, company_name, contact_name, is_approved, discount_tier)
VALUES ('admin@glovecubs.com', '<bcrypt_hash>', 'GloveCubs Admin', 'Admin User', 1, 'admin');

-- Supplier test user (if testing supplier portal)
INSERT INTO suppliers (email, password_hash, name, ...)
VALUES ('supplier@glovecubs.com', '<bcrypt_hash>', 'Test Supplier', ...);
```

### 2. Test Products

Ensure at least 5 products exist with known IDs:

```sql
SELECT id FROM products LIMIT 5;
-- Note these IDs for TEST_PRODUCT_IDS configuration
```

### 3. Test Upload (Optional)

For supplier upload tests, create a test upload:
```sql
INSERT INTO supplier_feed_uploads (supplier_id, file_name, status, ...)
VALUES (<supplier_id>, 'test-upload.csv', 'processed', ...);
-- Note the upload ID for TEST_UPLOAD_ID
```

## Configuration

Edit `config.js` or pass environment variables:

```bash
# Via environment
k6 run --env BASE_URL=https://staging.glovecubs.com \
       --env TEST_USER_EMAIL=test@company.com \
       --env TEST_USER_PASSWORD=secret123 \
       scenarios/product-search.js
```

### Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | http://localhost:3004 | Main Express server URL |
| `STOREFRONT_URL` | http://localhost:3005 | Next.js storefront URL |
| `TEST_USER_EMAIL` | loadtest@glovecubs.com | Buyer test account |
| `TEST_USER_PASSWORD` | LoadTest123! | Buyer password |
| `ADMIN_EMAIL` | admin@glovecubs.com | Admin test account |
| `ADMIN_PASSWORD` | AdminTest123! | Admin password |
| `SUPPLIER_EMAIL` | supplier@glovecubs.com | Supplier test account |
| `SUPPLIER_PASSWORD` | SupplierTest123! | Supplier password |
| `AUTH_TOKEN` | (empty) | Pre-generated auth token |
| `TEST_PRODUCT_IDS` | 1,2,3,4,5 | Comma-separated product IDs |
| `TEST_UPLOAD_ID` | (empty) | Supplier upload ID for preview tests |
| `PROFILE` | normal | Test profile (smoke/normal/stress/stress_250/stress_500/spike/soak/breakpoint) |
| `OUTCOME_API_URL` | same as STOREFRONT_URL | Recommendation outcome write API base URL |
| `THRESHOLD_P95_MS` | 500 | Override p95 latency threshold (ms) |
| `THRESHOLD_ERROR_RATE` | 0.01 | Override max error rate (0–1) |
| `THRESHOLD_DUPLICATE_WRITES` | 5 | Max allowed duplicate-write failures (outcome scenario) |

## Test Profiles

| Profile | VUs | Duration | Use Case |
|---------|-----|----------|----------|
| `smoke` | 10 | 1m | Quick functionality check |
| `normal` | 50 | 5m | Expected production load |
| `stress` | 100 | 10m | Elevated load, find limits |
| `stress_250` | 250 | 5m | High concurrency |
| `stress_500` | 500 | 3m | Peak load |
| `spike` | 50→250→50 | ~5m | Sudden traffic surge |
| `soak` | 50 | 30m | Sustained load, find leaks |
| `breakpoint` | 50→500→100 | ~10m | Find maximum capacity |

## Running Tests

### Production run (all 9 scenarios in one k6 run)

Single command runs all scenarios in parallel with endpoint-specific metrics and thresholds:

```bash
# Smoke (10 VUs, 1 min) – verify all endpoints
npm run run:smoke

# Normal (50 VUs, 5 min)
npm run run:normal

# Stress (100 VUs, 10 min)
npm run run:stress

# Stress 250 / 500 VUs
npm run run:stress:250
npm run run:stress:500

# With JSON or HTML report
npm run run:json
npm run run:html
```

Override base URL and auth (e.g. staging):

```bash
k6 run --env PROFILE=normal --env BASE_URL=https://staging.glovecubs.com --env STOREFRONT_URL=https://staging-store.glovecubs.com --env AUTH_TOKEN=your_token run-all.js
```

### Quick Smoke Test (mixed workload only)
```bash
npm run test:smoke
```

### Individual Scenarios

```bash
# Search functionality
npm run test:search
npm run test:search:smoke
npm run test:search:stress

# Product views
npm run test:product
npm run test:product:smoke

# Quote submissions
npm run test:quote
npm run test:quote:smoke

# Login concurrency
npm run test:login
npm run test:login:stress

# Dashboard loads
npm run test:dashboard

# Favorites operations
npm run test:favorites

# Admin review queue
npm run test:admin

# Supplier upload preview
npm run test:supplier

# Recommendation outcomes
npm run test:outcomes
```

### Full Test Suites

```bash
# All scenarios with smoke profile
npm run test:all:smoke

# All scenarios with normal profile
npm run test:all:normal

# Mixed workload simulation
npm run test:normal
npm run test:stress
npm run test:spike
```

### Custom Runs

```bash
# Custom VU count
k6 run --vus 200 --duration 5m scenarios/product-search.js

# Custom with environment
k6 run --env PROFILE=stress \
       --env BASE_URL=https://staging.glovecubs.com \
       scenarios/mixed-workload.js

# Output to JSON
k6 run --out json=results/custom-run.json scenarios/product-search.js
```

## Thresholds

Default pass/fail thresholds:

| Metric | Threshold | Description |
|--------|-----------|-------------|
| `http_req_duration p95` | < 500ms | 95% of requests under 500ms |
| `http_req_duration p99` | < 1000ms | 99% of requests under 1s |
| `http_req_failed` | < 1% | Less than 1% error rate |
| `login_duration p95` | < 1000ms | Login responses under 1s |
| `search_duration p95` | < 500ms | Search responses under 500ms |
| `quote_duration p95` | < 2000ms | Quote submission under 2s |
| `duplicate_write_failures` | < 5 (configurable) | Duplicate-write tolerance for outcome scenario |
| `dashboard_duration p95` | < 800ms | Dashboard aggregate load |
| `admin_duration p95` | < 1000ms | Admin review queue |
| `supplier_duration p95` | < 800ms | Supplier upload metadata/preview |
| `outcome_write_duration p95` | < 500ms | Recommendation outcome writes |

## Scenarios Covered

### 1. Buyer Login (`buyer-login.js`)
- Concurrent authentication requests
- Login latency measurement
- Error rate tracking
- Rate limiting verification

### 2. Product Search (`product-search.js`)
- Concurrent search queries
- Relevance sort verification
- Search result quality
- Search latency measurement

### 3. Product View (`product-view.js`)
- Product detail page loads
- Supplier offers API (comparison)
- Trust/reliability data verification
- Concurrent product access

### 4. Quote Submit (`quote-submit.js`)
- RFQ/quote form submission
- Unique data generation
- Quote creation verification
- Submission latency

### 5. Dashboard Load (`dashboard-load.js`)
- Authenticated dashboard access
- Multiple API calls (orders, quotes, favorites)
- Batch request handling
- Session management

### 6. Favorites (`favorites.js`)
- Add/remove favorite operations
- Concurrent write handling
- Idempotency verification
- Error handling

### 7. Admin Review (`admin-review.js`)
- Review queue reads
- Filter variations
- Admin authentication
- Response data verification

### 8. Supplier Upload (`supplier-upload.js`)
- Upload status checks
- Preview row retrieval
- Supplier authentication
- API availability

### 9. Outcome Write (`outcome-write.js`)
- Recommendation outcome recording
- Duplicate write detection
- Unique ID generation
- Concurrent write safety

### 10. Mixed Workload (`mixed-workload.js`)
- Weighted scenario distribution
- Realistic traffic simulation
- Combined load patterns
- Production-like behavior

## Generating Reports

After running tests:

```bash
npm run report
```

This generates a summary report in `results/` with:
- Pass/fail status per scenario
- p95 latency by endpoint
- Error rates
- Endpoint-specific failures
- Recommendations

## Output and endpoint-specific summary

k6 prints a summary to stdout with:
- **http_req_duration** by tag (e.g. `name=login`, `name=product_search`, `name=quote_submit`) for endpoint-specific p95/p99
- **http_req_failed** rate per tag
- **Custom metrics**: `login_duration`, `search_duration`, `quote_duration`, `dashboard_duration`, `admin_duration`, `supplier_duration`, `outcome_write_duration`, `duplicate_write_failures`
- **Thresholds**: pass/fail for each defined threshold

To get endpoint-specific failures, use tags in thresholds or run with `--summary-trend-stats="avg,p(95),p(99)"` and inspect the printed table.

## Output Files

Results are saved to `results/`:
- `{scenario}.json` - Raw k6 output (when using `--out json=...`)
- `run.html` - HTML report (when using `npm run run:html`)
- `report-{timestamp}.txt` - Summary report (when using `npm run report`)

## Troubleshooting

### k6 not found
```bash
# Verify installation
which k6  # Linux/macOS
where k6  # Windows
```

### Authentication failures
- Verify test users exist in database
- Check password hashes are correct
- Use pre-generated tokens via `AUTH_TOKEN` env var

### High error rates
- Check if server is running
- Verify BASE_URL is correct
- Check for rate limiting
- Review server logs

### Threshold failures
- Review p95/p99 latencies
- Check database performance
- Consider adding indexes
- Scale resources if needed

## CI/CD Integration

Example GitHub Actions:

```yaml
name: Load Tests
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
            | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
          
      - name: Run smoke tests
        working-directory: load-tests
        run: npm run test:smoke
        env:
          BASE_URL: ${{ secrets.STAGING_URL }}
          AUTH_TOKEN: ${{ secrets.TEST_AUTH_TOKEN }}
          
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: load-tests/results/
```

## Runbook (production / staging)

1. **Pre-run**
   - Ensure `scripts/setup-test-data.sql` has been applied (test users, product IDs).
   - Set `BASE_URL` and `STOREFRONT_URL` (and optional `AUTH_TOKEN`, `ADMIN_TOKEN`, `SUPPLIER_TOKEN`).
   - For supplier upload scenario, create one feed upload and set `TEST_UPLOAD_ID`.
   - For outcome writes, ensure recommendation-outcomes API is available or stub it; set `OUTCOME_API_URL` if different from storefront.

2. **Run**
   - Smoke: `npm run run:smoke` (must pass all thresholds).
   - Normal: `npm run run:normal`.
   - Stress: `npm run run:stress` or `run:stress:250` / `run:stress:500`.

3. **Post-run**
   - Check k6 stdout for threshold pass/fail and endpoint-specific metrics.
   - If `duplicate_write_failures` exceeded threshold, investigate recommendation outcome write path and advisory locking.
   - If p95 or error rate failed, correlate with server logs and DB load; tune thresholds or capacity.

4. **Seed data reference**
   - See `scripts/setup-test-data.sql` for test users (buyer, admin, supplier), product IDs, and optional upload ID.
   - Generate password hashes: `node -e "console.log(require('bcryptjs').hashSync('YourPassword', 10))"`.

## Best Practices

1. **Run smoke tests first** - Verify functionality before load testing
2. **Use staging environment** - Don't load test production directly
3. **Clean up test data** - Remove load test quotes/orders after testing
4. **Monitor server during tests** - Watch CPU, memory, database connections
5. **Start small** - Increase VUs gradually to find limits
6. **Review failures** - Investigate any threshold breaches
7. **Test regularly** - Include in CI/CD for regression detection
