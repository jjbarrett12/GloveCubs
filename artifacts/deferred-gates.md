# Deferred gates (WS CatalogOS / RLS / warehouse / payment)

Recorded on `remediate/quote-first-pilot` after pilot-critical workstreams.

## Explicitly deferred (do not start on this branch)

| Gate | Work | Park location |
|---|---|---|
| GATE 6 partial | Broader tenant RLS on `gc_commerce.orders` / `user_profiles` | Design before migrate |
| GATE 6 partial | CatalogOS `score-extraction.ts` build fix | `catalogos/` app when publish path needed |
| GATE 7 | Warehouse / inventory foundation completion | `release/warehouse-variant-inventory` @ 6638939; dirty WT quarantine |
| GATE 8 | Payment / Stripe webhooks | `release/payment-webhook-foundations` @ e4ddb57 |

## Resume rules

- Payment resumes only after Gates 6 and 7.
- Warehouse merges only after quote-first pilot is stable and inventory CI drift is intentional.
- Do not apply payment migrations or merge payment branch into this remediation line.
