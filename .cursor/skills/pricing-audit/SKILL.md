---
name: pricing-audit
description: Validate product pricing correctness and consistency.
---

# Pricing Audit

## Scope
Only inspect pricing logic for products or orders in question.

## Check
1. Identify price source
- product table, tier, override, or calculation

2. Validate consistency
- same product returns same price across surfaces

3. Validate overrides
- discounts, tiers, contracts applied correctly

4. Validate persistence
- price shown matches stored or intended source

## Flag
- inconsistent pricing across pages
- incorrect tier/discount applied
- calculated price not tied to stored data
- missing or overridden price without reason

## Output
- items checked
- inconsistencies
- source mismatch
- fix

## Stop
Stop when pricing path is verified.