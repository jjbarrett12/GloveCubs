---
name: shipping-margin-check
description: Validate shipping cost handling and margin impact.
---

# Shipping Margin Check

## Scope
Only inspect shipping cost, pricing, and margin impact.

## Check
1. Identify shipping source
- order field vs calculated estimate

2. Validate margin interaction
- ensure shipping does not distort margin improperly

3. Validate consistency
- checkout vs admin vs analytics match

4. Validate edge cases
- free shipping, thresholds, overrides

## Flag
- shipping treated as zero incorrectly
- mismatch between stored and calculated shipping
- margin inflated by missing shipping cost
- inconsistent handling across flows

## Output
- flows checked
- issue
- impact
- fix

## Stop
Stop when shipping path is validated.