# CatalogOS Phase 1 — Ingestion Pipeline File Structure

```
catalogos/src/
├── lib/
│   ├── db/
│   │   ├── client.ts                 # getSupabaseCatalogos(useServiceRole) for catalogos schema
│   │   └── types.ts                  # Catalogos DB row types (UUID)
│   ├── ingestion/
│   │   ├── types.ts                  # Pipeline types: RawRow, NormalizedRow, MatchResult, AnomalyFlag, etc.
│   │   ├── fetch-feed.ts             # Fetch remote feed URL (GET), return buffer + content-type
│   │   ├── parsers/
│   │   │   ├── index.ts              # Parser abstraction: detect format, parse() -> ParsedRow[]
│   │   │   ├── csv-parser.ts         # Parse CSV to array of record objects
│   │   │   └── json-parser.ts        # Parse JSON array or JSONL to ParsedRow[]
│   │   ├── batch-service.ts          # createImportBatch(feedId, supplierId) -> batchId
│   │   ├── raw-service.ts            # insertRawRows(batchId, supplierId, rows) -> rawIds
│   │   ├── attribute-extraction.ts   # extractGloveAttributes(rawRow) -> GloveAttributes + confidence
│   │   ├── normalize-service.ts     # buildNormalizedFromRaw(rawRow, attributes) -> normalized_data
│   │   ├── match-service.ts          # matchToMaster(normalized, categoryId) -> MatchResult (id, confidence, reason)
│   │   ├── pricing-service.ts        # computeSellPrice(cost, categoryId, supplierId?, productId?) -> price, ruleApplied
│   │   ├── anomaly-service.ts        # flagAnomalies(rawRow, normalized, match, cost, sellPrice) -> AnomalyFlag[]
│   │   ├── offer-service.ts          # createSuggestedOffers(normalizedRowsWithMatch) -> void
│   │   └── run-pipeline.ts           # runImport(feedId | supplierId, feedUrl?) — orchestration
│   └── validations/
│       └── ingestion-schemas.ts      # Zod: trigger import body, parser output, etc.
└── app/
    └── api/
        └── ingest/
            └── route.ts              # POST /api/ingest — validate body, call runPipeline
```

All ingestion code is server-side. Route handler validates with Zod and invokes the orchestration service.
