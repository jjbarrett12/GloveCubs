# Supplier Discovery Agent — Architecture

## Goal

Internal agent that discovers potential glove/PPE/safety suppliers, stores them as **supplier leads**, scores quality, and prepares them for onboarding outreach. No fake scraping: discovery **sources are adapters** (search, manual entry, CSV import) that plug in later.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Admin UI (Next.js App Router)                     │
│  Discovery Runs │ Supplier Leads List │ Lead Detail │ Actions            │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Discovery Service (orchestrator)                     │
│  - Creates run, invokes adapter, persists leads, logs events, scores     │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Search/Web        │    │ Manual Entry      │    │ CSV Import        │
│ Adapter (future)  │    │ Adapter           │    │ Adapter           │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

- **supplier_leads**: One row per potential supplier (domain-unique). Status: new → reviewed → contacted → onboarded | rejected.
- **supplier_lead_contacts**: Optional contacts per lead (e.g. multiple emails).
- **supplier_discovery_runs**: One row per discovery job (manual trigger, scheduled, or CSV import). Links to events.
- **supplier_discovery_events**: Log entries per run (lead created, duplicate skipped, error, etc.).
- **Adapters**: Implement `DiscoveryAdapter`. Return `RawLeadCandidate[]`. Service normalizes, dedupes by domain, scores, inserts leads and events.

## File Structure

```
catalogos/
  supabase/migrations/
    20260321000001_supplier_discovery.sql
  src/
    lib/
      discovery/
        types.ts              # Domain types, status enum
        adapters/
          types.ts            # DiscoveryAdapter interface
          manual-adapter.ts   # Single lead from form
          csv-adapter.ts      # Parse CSV → candidates (stub)
          search-adapter.ts   # Future: search adapter (stub)
        scoring.ts            # lead_score from signals
        leads.ts              # CRUD + promote to supplier
        runs.ts               # Create run, log events, list runs
        discovery-service.ts  # Run discovery with adapter
    app/
      (dashboard)/dashboard/
        discovery/
          runs/page.tsx       # Discovery runs list
          leads/page.tsx      # Supplier leads list
          leads/[id]/page.tsx # Lead detail + actions
        layout.tsx            # + Discovery nav link
      actions/
        discovery.ts          # markReviewed, reject, promoteToSupplier
```

## Data Flow

1. **Run discovery**: Admin starts a run (or cron) with a chosen adapter (e.g. manual, CSV). Discovery service creates `supplier_discovery_run`, calls adapter, for each candidate: normalize domain, check duplicate by domain, compute score, insert lead + event.
2. **Review queue**: Leads with status `new` or `reviewed` appear in leads list. Admin opens detail, can mark reviewed, reject, or **promote to supplier** (creates `catalogos.suppliers` row, optional contact, updates lead status to `onboarded`).
3. **Promote**: Creates supplier by name/slug from lead, links lead to supplier (`promoted_supplier_id`), copies contacts to `supplier_contacts`, sets lead status to `onboarded`.

## Phased Implementation

- **Phase 1 (done)**: Schema, types, adapters (manual + CSV stub), scoring, leads/runs/events CRUD, discovery service, admin pages (runs, leads list, lead detail), actions (mark reviewed, reject, promote), test scaffolding.
- **Phase 2**: CSV adapter with file upload in UI; run detail page with event list; optional filters on leads (by status, score).
- **Phase 3**: Search/web adapter (real integration: e.g. Serp API or internal crawler) returning `RawLeadCandidate[]`; rate limiting and idempotent runs.
