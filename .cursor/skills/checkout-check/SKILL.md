---
name: checkout-check
description: Validate checkout totals, pricing, tax, shipping, and final order integrity.
---

# Checkout Check

## Scope
Only inspect checkout flow, pricing calculation, and order persistence paths.

## Check
1. Identify calculation source
- where totals are computed (UI, API, DB)

2. Validate totals
- subtotal, discount, shipping, tax, total
- ensure total matches persisted order fields

3. Validate line math
- sum(qty × unit_price) matches expected subtotal
- confirm discounts applied consistently

4. Validate shipping + tax
- ensure values match persisted order, not recalculated differently

## Flag
- total ≠ sum of components
- UI vs DB mismatch
- discount applied inconsistently
- shipping/tax recomputed differently than stored

## Output
- files checked
- issues found
- exact mismatch
- fix

## Stop
Stop when checkout calculation path is fully traced.