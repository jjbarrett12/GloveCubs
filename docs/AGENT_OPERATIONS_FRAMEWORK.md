# Agent Operations Framework

Production-grade infrastructure for autonomous catalog intelligence operations.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    CRON SCHEDULES                               │
│  Daily (6 AM)    Nightly (2 AM)    Weekly (Sunday 3 AM)        │
└────────┬────────────────┬─────────────────────┬─────────────────┘
         │                │                     │
         ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    JOB QUEUE                                     │
│  job_queue table with atomic claiming                            │
│  Priorities: 1 (highest) → 100 (lowest)                         │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WORKER                                        │
│  POST /api/internal/worker                                      │
│  Claims job → Dispatches to handler → Records result            │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    JOB HANDLERS                                  │
│  supplier_discovery    product_normalization    audit_run       │
│  supplier_ingestion    product_match            daily_price_guard│
│  competitor_price_check   pricing_recommendation                │
└────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────────┐    ┌─────────────────────────────────────┐
│    REVIEW QUEUE     │    │         SYSTEM EVENTS               │
│  Items for humans   │    │  Triggers followup jobs             │
└─────────────────────┘    └─────────────────────────────────────┘
```

## Job Lifecycle

```
┌──────────┐     ┌─────────┐     ┌───────────┐
│ PENDING  │ ──► │ RUNNING │ ──► │ COMPLETED │
└──────────┘     └────┬────┘     └───────────┘
     ▲                │               
     │           ┌────┴────┐          
     │           ▼         ▼          
     │      ┌────────┐  ┌─────────┐   
     └──────│ FAILED │  │ BLOCKED │   
       retry└────────┘  └─────────┘   
```

1. **Pending** - Job created, waiting for worker
2. **Running** - Worker claimed job, executing
3. **Completed** - Job finished successfully
4. **Failed** - Job failed, will retry if attempts remain
5. **Blocked** - Job cannot proceed safely, needs review

## Database Tables

| Table | Purpose |
|-------|---------|
| `job_queue` | All pending/running/completed jobs |
| `job_runs` | Immutable audit log of each execution |
| `review_queue` | Items requiring human review |
| `audit_reports` | Results from audit supervisor runs |
| `agent_config` | Enable/disable agents, settings |
| `agent_rules` | Business rules and thresholds |
| `system_events` | Event-driven triggers |
| `cron_locks` | Prevent overlapping scheduled runs |

## Cron Schedule

| Schedule | Jobs Enqueued |
|----------|--------------|
| **Daily 6 AM** | daily_price_guard, competitor_price_check (top SKUs), system_event_processor |
| **Nightly 2 AM** | audit_run, cleanup old jobs/events |
| **Weekly Sunday 3 AM** | supplier_discovery, long-tail pricing, full catalog price check |

## Event Flow

```
1. Supplier file uploaded
   → system_event: supplier_file_uploaded
   → job: supplier_ingestion

2. Supplier ingestion completes
   → system_event: supplier_ingestion_completed
   → jobs: product_normalization (per row)

3. Product normalization completes
   → system_event: product_normalization_completed
   → job: product_match (if confidence high)
   → review_queue (if confidence low)

4. Product match uncertain
   → system_event: product_match_uncertain
   → review_queue item created

5. Supplier cost changes
   → system_event: supplier_cost_changed
   → job: pricing_recommendation

6. Daily scheduled run
   → job: daily_price_guard
   → jobs: competitor_price_check (for top SKUs)
```

## Review Workflow

1. Agent creates review item with:
   - Review type (supplier, catalog, pricing, etc.)
   - Priority (critical, high, medium, low)
   - Issue summary and recommended action
   - Source reference and details

2. Admin views queue at `/admin/review`

3. Admin actions:
   - **Approve** - Accept recommendation
   - **Reject** - Decline recommendation
   - **Resolve** - Custom resolution

4. System event emitted on resolution for automation

## Safety Rules

### Never Auto-Publish When:
- Confidence below threshold (90%)
- Pack size ambiguous
- Grade mismatch
- MAP conflict possible
- Margin floor violated
- Shipping unknown for close prices
- Supplier legitimacy unresolved

### Always Block If:
- Recommended price below margin floor (22%)
- Recommended price below MAP
- Critical field conflicts in match
- Supplier trust score too low

### Always Create Review If:
- Price swing > 7%
- Match confidence < 85%
- Parse confidence < 90%
- Missing required fields

## Adding New Job Types

1. Add type to `JOB_TYPES` in `lib/agents/types.ts`

2. Create handler in `lib/jobs/handlers/`:

```typescript
export async function handleMyNewJob(
  payload: Record<string, unknown>
): Promise<JobExecutionResult> {
  const reviewItems: ReviewQueueCreateInput[] = [];
  const followupJobs: EnqueueJobInput[] = [];
  
  try {
    // Your logic here
    
    return {
      success: true,
      output: { /* results */ },
      reviewItems,
      followupJobs,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
```

3. Register in `lib/jobs/dispatcher.ts`:

```typescript
import { handleMyNewJob } from './handlers/myNewJob';

const HANDLERS: Record<JobType, JobHandler> = {
  // ...existing
  my_new_job: handleMyNewJob,
};
```

4. Add agent rules if needed in migration

## Debugging Failed Jobs

1. Go to `/admin/jobs?status=failed`

2. Check `last_error` for error message

3. Query job runs for full history:
```sql
SELECT * FROM job_runs 
WHERE job_id = 'xxx' 
ORDER BY started_at DESC;
```

4. Check `output_payload` for handler output

5. Retry job:
```typescript
import { retryJob } from '@/lib/jobs/fail';
await retryJob(jobId);
```

## Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Cron/Worker Auth
CRON_SECRET=your-secret-for-cron
WORKER_SECRET=your-secret-for-worker

# Optional
NODE_ENV=production
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/internal/cron/daily` | POST | Daily scheduled jobs |
| `/api/internal/cron/nightly` | POST | Nightly scheduled jobs |
| `/api/internal/cron/weekly` | POST | Weekly scheduled jobs |
| `/api/internal/worker` | POST | Process next job |
| `/api/internal/worker` | GET | Get worker info |

## Admin Pages

| Page | Purpose |
|------|---------|
| `/admin/jobs` | View job queue, filter by status |
| `/admin/review` | Review queue, approve/reject items |
| `/admin/audit-reports` | View audit run results |
| `/admin/agent-config` | Agent settings and rules |

## Monitoring

### Key Metrics to Track:
- Pending job count by type
- Failed job rate
- Average job duration
- Review queue backlog
- Blocked actions count

### Health Checks:
- Stale jobs (locked > 30 min)
- Failed jobs at max attempts
- Review items > 24 hours old
- Systemic issues from audits

## File Structure

```
storefront/
├── src/
│   ├── lib/
│   │   ├── agents/
│   │   │   ├── types.ts          # All type definitions
│   │   │   └── config.ts         # Agent config helpers
│   │   ├── jobs/
│   │   │   ├── supabase.ts       # Admin client
│   │   │   ├── enqueue.ts        # Create jobs
│   │   │   ├── claim.ts          # Claim jobs
│   │   │   ├── complete.ts       # Complete jobs
│   │   │   ├── fail.ts           # Fail/retry jobs
│   │   │   ├── block.ts          # Block jobs
│   │   │   ├── logger.ts         # Structured logging
│   │   │   ├── dispatcher.ts     # Route to handlers
│   │   │   └── handlers/         # Job handlers
│   │   ├── events/
│   │   │   └── emit.ts           # System events
│   │   └── review/
│   │       ├── createReviewItem.ts
│   │       └── updateReviewStatus.ts
│   └── app/
│       ├── api/internal/
│       │   ├── cron/
│       │   │   ├── daily/route.ts
│       │   │   ├── nightly/route.ts
│       │   │   └── weekly/route.ts
│       │   └── worker/route.ts
│       └── admin/
│           ├── layout.tsx
│           ├── jobs/page.tsx
│           ├── review/page.tsx
│           ├── audit-reports/page.tsx
│           └── agent-config/page.tsx
└── supabase/
    └── migrations/
        └── 20260311000001_agent_operations_schema.sql
```

## Security

### Admin Route Protection
Admin routes are protected by middleware (`src/middleware.ts`):
- In development: Access allowed without strict auth
- In production: Requires Supabase session OR admin secret header
- Admin role check via `user_metadata.role === 'admin'` or `@glovecubs.com` email

### Internal API Protection
Cron and worker routes require `CRON_SECRET` or `WORKER_SECRET` in Authorization header:
```bash
curl -X POST /api/internal/worker \
  -H "Authorization: Bearer $WORKER_SECRET"
```

## Risks and Assumptions

1. **Supabase Connection** - Requires stable connection; jobs retry on transient failures

2. **Serverless Limits** - Worker processes one job per invocation for serverless safety; increase `max_jobs` for persistent workers

3. **Business Logic** - Handlers contain TODO markers where specific agent logic needs integration

4. **Scaling** - Single worker; add multiple workers or use edge functions for higher throughput

5. **Race Conditions** - Mitigated via:
   - `claim_next_job` Postgres function with `FOR UPDATE SKIP LOCKED`
   - `enqueue_job_atomic` function for dedupe
   - `create_review_item_atomic` function for review dedupe
   - Partial unique indexes on dedupe columns

## What Needs Integration

1. **Supplier Discovery** - Actual supplier search sources
2. **File Parsing** - CSV/XLSX parsing in supplier_ingestion
3. **Product Normalization** - Use existing `lib/productNormalization.js`
4. **Product Matching** - Use existing `lib/productMatching.js`
5. **Competitive Pricing** - Use existing `lib/competitivePricing.js`
6. **Daily Price Guard** - Use existing `lib/dailyPriceGuard.js`
7. **Audit Supervisor** - Use existing `lib/qaSupervisor.js`
