# Product Export & Import (Long-term guide)

Glovecubs uses a **single product store** (`lib/product-store.js`) for all CSV import and export. The same format and mapping are used in the Admin UI and the CLI so you can export, edit in Excel/Sheets, and re-import reliably.

---

## Quick workflow

1. **Export** – Download current products as CSV (Admin or API).
2. **Edit** – Add rows, change columns (e.g. price, industry, image_url).
3. **Import** – Upload the CSV (Admin) or run the CLI. Products are matched by **SKU**; same SKU = update, new SKU = add.

---

## Where to export and import

| Method | Export | Import | Best for |
|--------|--------|--------|----------|
| **Admin UI** | Products → Export CSV | Products → Import from CSV | Day-to-day use, no terminal |
| **CLI** | (use Admin or API) | `node import-products.js file.csv [--replace]` | Scripts, bulk runs, CI |
| **API** | `GET /api/products/export.csv` (auth) | `POST /api/products/import-csv` (auth, body: `csvContent`, optional `deleteNotInImport`) | Integrations, automation |

---

## CSV format

- **Encoding:** UTF-8 (Excel: “CSV UTF-8” or save as UTF-8).
- **Delimiter:** Comma (`,`). Semicolon (`;`) is auto-detected for European Excel.
- **Header row:** Required. Column names are flexible (see below).

### Export columns (in order)

`sku`, `name`, `brand`, `category`, `subcategory`, `description`, `material`, `powder`, `thickness`, `sizes`, `color`, `grade`, `useCase`, `certifications`, `texture`, `cuffStyle`, `sterility`, `pack_qty`, `case_qty`, `price`, `bulk_price`, `image_url`, `in_stock`, `featured`, `industry`

### Import: accepted header names (examples)

- **SKU:** `sku`, `product_sku`, `item_number`, `part_number`, `product code`, `item code`
- **Name:** `name`, `product name`, `product_name`, `title`, `product`, `item name`
- **Brand:** `brand`, `manufacturer`, `maker`, `vendor`, `supplier`, `brand name`, `mfr`
- **Industry / use case:** `useCase`, `use case`, `usecase`, `industry`, `industries`
- **Image:** `image_url`, `image url`, `image`, `imageurl`, `url`, `photo`, `picture`

Required for each row: **sku**, **name**, **brand**, **material**, **price**. Rows missing any of these are skipped.

---

## Import options

- **Add/update only (default)** – Rows in the CSV add new products or update existing ones by SKU. Products not in the CSV are left unchanged.
- **Full replace** – “Delete products not in this import”: after import, any product whose SKU is *not* in the CSV is removed. Use when the CSV is the full catalog.
  - **Admin:** Check “Delete products not in this import” before importing.
  - **CLI:** `node import-products.js file.csv --replace`

---

## CLI reference

```bash
# Add/update products from CSV (existing products not in CSV are kept)
node import-products.js products.csv

# Full catalog replace (remove products whose SKU is not in the CSV)
node import-products.js products.csv --replace
```

Imports use the same logic as the Admin/API (same `lib/product-store.js`), so behavior is identical.

---

## Future: Fishbowl inventory & catalog

- **Inventory today:** Fishbowl **inventory** is already integrated. `POST /api/fishbowl/sync-inventory` updates Glovecubs product `in_stock` and `quantity_on_hand` from Fishbowl (by part number / SKU). See `FISHBOWL_INTEGRATION.md`.
- **Catalog later:** A future **product catalog** sync from Fishbowl would:
  - Pull part numbers, descriptions, and costs from Fishbowl.
  - Create or update Glovecubs products via the same product shape used in `lib/product-store.js` (and optionally CSV export/import).
  - That sync can be implemented in `lib/product-store.js` (e.g. `syncProductCatalogFromFishbowl`) or in `fishbowl.js` and then call into the product store so CSV and Fishbowl stay in sync.

Keeping all product logic in `lib/product-store.js` ensures export, import, and future Fishbowl catalog integration share one format and one place to change.
