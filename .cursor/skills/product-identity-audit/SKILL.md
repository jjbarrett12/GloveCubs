---
name: product-identity-audit
description: Validate product identity, deduplication, and normalization.
---

# Product Identity Audit

## Scope
Only inspect product matching, identity, and dedupe logic.

## Check
1. Identify identity fields
- sku, manufacturer, name, uom

2. Validate matching
- ensure correct product linking across imports

3. Validate deduplication
- no duplicate products for same identity

4. Validate normalization
- consistent formatting across records

## Flag
- duplicate products for same item
- incorrect merges
- inconsistent naming/uom
- weak matching overwriting strong identity

## Output
- products checked
- identity issues
- merge/dedupe errors
- fix

## Stop
Stop when identity path is confirmed.