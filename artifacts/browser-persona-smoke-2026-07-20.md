# WS-R4 — Browser persona smoke (2026-07-20)

**Environment:** Production `https://www.glovecubs.com` (live) + remediation tip not deployed  
**Widths checked:** default desktop (~1440-class viewport via browser) + mobile Emulation 375×812

## Personas

| Persona | Surface | Result |
|---------|---------|--------|
| Anon prospect | `/store` browse + Add to Quote CTAs | PASS (UI reachable) |
| Anon prospect | Catalog credibility | **FAIL** — launch/UNKNOWN SKUs visible (Gate 1 ops) |
| Signed-in customer | `/account/*` quotes/quicklist | SKIPPED — no staging auth session in agent |
| Company admin invite accept | `/invite/[token]` | SKIPPED — migration not on staging/prod |
| GC admin leads search | `/admin/leads` | SKIPPED — requires admin auth |

## Width notes

### Desktop (~1440)

- Store grid readable; quote CTAs present; facets sidebar dense
- Empty industry facets with `0` still shown (filter not on prod)

### Mobile 375 (Emulation 375×812)

- Layout usable: logo, Quote / Create account / Sign In, search, Browse grid / RFQ / Invoice, Filters & specs, sort chips, Add page to quote
- Still shows **9 listings**; launch SKU issue unchanged (data + undeployed filter)

## Verdict

Browser smoke on **production** confirms catalog Gate 1 still red. Full persona matrix requires **staging deploy + invite migration** (WS-R3). Do not treat this as Gate 2/3 pass.
