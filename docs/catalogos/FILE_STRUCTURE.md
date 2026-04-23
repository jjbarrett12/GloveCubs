# CatalogOS — File and Folder Structure

```
catalogos/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Home (links to dashboard)
│   │   ├── globals.css
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx          # Sidebar nav
│   │   │   └── dashboard/
│   │   │       ├── page.tsx        # /dashboard
│   │   │       ├── suppliers/
│   │   │       ├── feeds/
│   │   │       ├── batches/
│   │   │       ├── staging/
│   │   │       ├── review/
│   │   │       │   └── [id]/page.tsx
│   │   │       └── master-products/
│   │   └── api/
│   │       ├── ingest/route.ts      # POST ingest
│   │       ├── publish/route.ts     # POST publish
│   │       └── staging/[id]/route.ts # PATCH staging status
│   ├── lib/
│   │   ├── db/
│   │   │   ├── client.ts           # getSupabase(useServiceRole)
│   │   │   └── types.ts            # Database typings
│   │   ├── validations/
│   │   │   └── schemas.ts          # Zod schemas
│   │   ├── constants/
│   │   │   └── categories.ts
│   │   └── services/
│   │       ├── ingestion/
│   │       │   └── run-batch.ts
│   │       ├── normalization/
│   │       │   └── disposable-gloves.ts
│   │       ├── matching/
│   │       │   └── match-master.ts
│   │       ├── pricing/
│   │       │   └── compute-price.ts
│   │       └── publish/
│   │           └── publish-staging.ts
│   └── types/
│       └── catalogos.ts            # Domain types
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.example
└── README.md
```

Migrations live in the **repo root** `supabase/migrations/`:

- `20260310000001_catalogos_schema.sql` — All CatalogOS tables
- `20260310000002_catalogos_seed_attributes.sql` — Attribute definitions (disposable gloves) + sample supplier
