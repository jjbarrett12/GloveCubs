# Migration timestamp convention

GloveCubs Supabase migrations use **lexicographic timestamps**, not necessarily the calendar date of authoring.

As of Phase 1 / 1A, the continuum already includes stamps in `202610*`, `202611*`, and `202612*` even when wall-clock time is earlier (e.g. July 2026).

## Rules

1. New migrations must sort **after** the latest existing file in `supabase/migrations/`.
2. **Do not** rename historical or unapplied migrations to “today’s” calendar date — that can place them *before* later-stamped files and scramble apply order.
3. Phase 1 security migrations:
   - `20261227120000` … `20261227120400` (Phase 1)
   - `20261227120500` (Phase 1A corrections)
4. Prefer additive corrective migrations over editing unapplied siblings when the delta is a policy correction.

## Operator note

Unapplied migrations may be edited carefully, but Phase 1A used a new file (`20500`) so the final policy delta is explicit.
