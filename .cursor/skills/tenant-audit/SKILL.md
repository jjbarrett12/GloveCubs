---
name: tenant-audit
description: Validate tenant isolation and data separation.
---

# Tenant Audit

## Scope
Only inspect tenant scoping and data access paths.

## Check
1. Identify tenant key
- organization_id or equivalent

2. Validate filtering
- all queries scoped correctly

3. Validate joins
- no cross-tenant leakage

4. Validate write paths
- new records assigned correct tenant

## Flag
- missing tenant filter
- cross-tenant data exposure
- incorrect tenant assignment
- unsafe joins

## Output
- paths checked
- violation
- affected data
- fix

## Stop
Stop when tenant boundaries are verified.