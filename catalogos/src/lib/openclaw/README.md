# OpenClaw — Glove Catalog Extraction Workflow

Takes a supplier/category URL or list of product URLs and produces a **structured, import-ready catalog dataset** for GLOVECUBS CatalogOS staging. **Does not auto-publish**; output is for review and import only.

**Normalization uses only existing GloveCubs site filters** (`catalogos` `filter-attributes.ts`). No new filter dimensions or broader ontology. Unmapped source data goes into `extraction_notes`, `raw_specs_json`, or `warning_messages`.

## Pipeline

1. **Discover** — Crawl category/collection URL; identify glove product pages; exclude blogs, support, cart, policy. Output: `product_url_list.json` shape.
2. **Fetch & parse** — Fetch each product page; extract title, meta, spec tables, JSON-LD, variant selectors.
3. **Extract** — Extract product-family and variant-level attributes with `raw_value`, `normalized_value`, `confidence`, `extraction_method`.
4. **Normalize** — Map only to site filter values: brand, material, glove_type (grade), size, color, thickness_mil, powder_status, sterile_status, box_qty, case_qty, texture, cuff_style, category. Unmapped fields → extraction_notes / raw_specs_json / warning_messages.
5. **Group** — One row per purchasable variant (size/color/thickness); `family_group_key`, `variant_group_key`.
6. **Warnings** — Per-row `needs_review`, `warning_messages`, `overall_confidence`.
7. **Output** — One row per variant with: source_url, family_name, variant_name, sku, brand, material, glove_type, size, color, thickness_mil, powder_status, sterile_status, box_qty, case_qty, texture, cuff_style, category, overall_confidence, needs_review, warning_messages, raw_title, raw_description, raw_specs_json, extraction_notes, field_extraction (per-field raw_value, normalized_value, confidence).
8. **Export** — `glove_catalog_rows.csv`, `glove_catalog_rows.json`, `extraction_summary.md`.

## Usage

### API

```http
POST /api/openclaw/run
Content-Type: application/json

{
  "root_url": "https://supplier.com/gloves",
  "product_urls": ["https://supplier.com/product/123"],
  "max_urls": 200
}
```

Returns: `{ rows, summary, product_url_list }`.

### Programmatic

```ts
import { runOpenClaw, runOpenClawAndExport } from "@/lib/openclaw";

const result = await runOpenClaw({
  root_url: "https://supplier.com/gloves",
  product_urls: ["https://supplier.com/p/glove-1"],
  max_urls: 500,
});

const { rows, summary } = result;

await runOpenClawAndExport(
  { root_url: "https://supplier.com/gloves" },
  "./output"
);
```

## Safety

- No auto-publish; all output is for staging/import.
- Source URL and confidence/warnings preserved on every row.
- SSRF-safe fetch; timeout and size limits.
- Prefer structured accuracy over aggressive guessing.

## Output → CatalogOS

Use the CSV or JSON as input to CatalogOS ingestion (e.g. CSV upload or staging import). Rows include `overall_confidence` and `needs_review` so admins can filter and bulk-approve high-confidence rows, then publish after review.
