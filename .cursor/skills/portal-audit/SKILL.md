---
name: portal-audit
description: Validate that portal UI reflects true underlying data.
---

# Portal Audit

## Scope
Only inspect user-facing UI and its backing data source.

## Check
1. Identify UI source
- component → API → DB

2. Validate data origin
- confirm values come from persisted data

3. Check consistency
- same metric matches across pages

4. Validate loading/fallback states
- no fake/demo values shown as real

## Flag
- UI shows calculated instead of stored data
- inconsistent values across screens
- fallback/demo data exposed
- stale or missing data without indication

## Output
- screens checked
- mismatches
- source of truth vs UI value
- fix

## Stop
Stop when UI → DB trace is complete.