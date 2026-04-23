---
name: analytics-check
description: Check whether reported analytics match stored commerce data. Use for dashboard KPI trust, revenue/margin verification, metric mismatches, and analytics audits.
---

# Analytics Check

## Scope
Validate only the requested metric, dashboard, route, or file set.
Do not scan unrelated analytics surfaces.

## Check
For each metric in scope:

1. Capture implementation
- metric name
- source file / route / query
- formula actually used
- filters used
- grain: order / line / product / company

2. Recompute from stored data
- use the same filters, statuses, date bounds, and timezone
- compare reported value vs raw recomputation
- document whether the metric is order-based or line-based

3. Validate cost / margin logic
- trace margin to an actual stored cost source
- do not assume missing cost = zero
- label current-cost margin as snapshot margin, not historical margin

4. Validate shipping / discount treatment
- separate customer-visible booked values from internal estimated cost
- do not replace persisted order values with recalculated estimates unless the implementation explicitly does so

5. Flag trust breaks
- mismatched filters
- mismatched timezone windows
- order-total metric presented as line revenue
- sample caps or row limits not disclosed
- missing-cost lines inflating margin
- dashboard/API value does not match raw recomputation

## Output
Return only:

### Scope
- metrics checked
- files/routes checked
- date window / timezone

### Findings
| Severity | Metric | Issue | Evidence | Fix |
|----------|--------|-------|----------|-----|

### Recomputed values
| Metric | Reported | Recomputed | Delta | Match |
|--------|----------|------------|-------|-------|

### Notes
- limitations
- blocked access
- undisclosed caps / sampling

## Severity
- P0: wrong money or misleading margin
- P1: inconsistent definitions or undisclosed caps
- P2: missing metadata or honest labeling

## Stop
Stop when:
- requested metrics are checked
- implementation path is identified
- recomputation is complete
- further file reading would broaden scope unnecessarily