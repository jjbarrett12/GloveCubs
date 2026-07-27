# Claims removal report — Phase 0

| Claim | File | Previous wording | New wording / removal | Evidence status |
|---|---|---|---|---|
| Authorized Distributor | `storefront/src/components/home/SiteHeader.tsx` | `Authorized Distributor` badge | `Manufacturer partners` | No manufacturer authorization evidence in repo |
| Authorized distributor for | `storefront/src/components/home/BrandCarousel.tsx` | `Authorized distributor for` | `Products sourced through established manufacturers and distribution partners` | No evidence |
| Authorized distributor brands (aria) | `storefront/src/app/page.tsx` | `Authorized distributor brands` | `Manufacturer and distribution partner brands` | No evidence |
| Authorized distributor tile | `HomeTrustTilesSection.tsx` / `HomeConsolidatedTrustSection.tsx` | `Authorized distributor` | `Established manufacturer partners` | No evidence |
| Fast fulfillment | same trust tiles | `Fast fulfillment` | `Lead times confirmed per quote` | No SLA evidence |
| Authorized distributor brands meta | `storefront/src/app/brands/page.tsx` | Authorized distributor brands… | Manufacturer and distribution partner brands… | No evidence |
| Exam-grade / clinical programs | `storefront/src/app/store/page.tsx` tiles | `Medical / exam` + exam-grade copy | `Healthcare & clinical buyers` + documentation on request | No SKU evidence gate |
| Nitrile exam gloves tile | same | `Nitrile exam gloves` | `Disposable nitrile programs` | Avoid exam claim without evidence |
| Food-Safe Nitrile chip | `storefront/src/config/industries.ts` | `Food-Safe Nitrile` | `Nitrile for food service` | No food-contact evidence object |
| Food-safe FAQ answers | `industries.ts` / `homeAuthority.ts` | We carry food-safe… | Verify documentation / suitability per use | Softened |
| Medical-grade / FDA FAQ | `industries.ts` | Suitable for exam… | No blanket medical/FDA claims; request SKU docs | Softened |
| Chemo-rated industry blurb | `homeAuthority.ts` | chemo-rated where published | verify published SKU documentation | Softened |
| Fast shipping / Quality guaranteed | `compare-wizard/page.tsx` | Fast shipping / Quality guaranteed | Quote-first B2B / Specs verified per SKU | Unsupported |
| Food-safe vinyl & nitrile | `HomeWhoSection.tsx` | Food-safe vinyl & nitrile… / Medical-grade compliance… | Vinyl/nitrile suitability language / Clinical programs documentation per SKU | Softened |
| Food-safe survey / cards | `HomeGloveEducationHub.tsx` | Do you need food-safe gloves? / Food-safe & compliant | Food contact question / Food-contact considerations | Educational, not product claim |

Regression protection: `storefront/src/lib/catalog/no-fake-doctrine.test.ts` forbids `Authorized Distributor`, `Fast shipping`, `Quality guaranteed`, unsupported `FDA-approved` / `medical-grade` public copy in scanned customer-facing dirs.
