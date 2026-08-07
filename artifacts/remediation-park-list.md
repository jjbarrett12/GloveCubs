# Quote-first pilot remediation — release park list

## Canonical base
- SHA: 32d039f61d02e57bb1eaf4338b0e10785ffd0021
- Branch: remediate/quote-first-pilot
- Worktree: C:/dev/Glovecubs-quote-first-pilot

## Parked (do not merge into this branch)
- Payment: release/payment-webhook-foundations @ e4ddb57
- Warehouse release: release/warehouse-variant-inventory @ 6638939
- Quote-first RC: release/glovecubs-quote-first-rc (ahead +30 of main — no wholesale merge)
- Quote-first certified: release/quote-first-certified @ 7a234b0 (gap-diff / cherry-pick only)

## Quarantined dirty worktree
- C:/dev/Glovecubs — do not implement, commit, or deploy from here
- Untracked warehouse/payment WIP remains untouched in that worktree

## Production promotion
- Merge PR from remediate/quote-first-pilot → main after review + staging smoke
- Record deployed SHA on each promotion
