---
name: import-check
description: Validate invoice/product import correctness and idempotency.
---

# Import Check

## Scope
Only inspect import pipeline and affected product/cost writes.

## Check
1. Identify import entry
- API route / ingestion job

2. Validate mapping
- fields mapped correctly (sku, name, price, uom)

3. Validate idempotency
- duplicate input does not create duplicate rows

4. Validate write targets
- correct tables updated
- no overwrite of stronger existing data

## Flag
- duplicate rows created
- incorrect field mapping
- overwriting trusted product data
- missing required fields

## Output
- files checked
- issue
- affected rows/tables
- fix

## Stop
Stop once import flow and write path are verified.