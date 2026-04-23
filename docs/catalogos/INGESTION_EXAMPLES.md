# CatalogOS Ingestion — Example Parser Inputs/Outputs

## CSV parser

**Input:**
```csv
sku,name,price,material,color,size
GLV-1,Nitrile Exam Gloves,12.99,nitrile,blue,M
GLV-2,Vinyl Gloves Powder-Free,8.99,vinyl,clear,L
```

**Output (parseCsv):**
```json
{
  "rows": [
    { "sku": "GLV-1", "name": "Nitrile Exam Gloves", "price": 12.99, "material": "nitrile", "color": "blue", "size": "M" },
    { "sku": "GLV-2", "name": "Vinyl Gloves Powder-Free", "price": 8.99, "material": "vinyl", "color": "clear", "size": "L" }
  ],
  "format": "csv",
  "rowCount": 2
}
```

## JSON parser (array)

**Input:**
```json
[
  { "sku": "GLV-1", "title": "Nitrile Gloves", "cost": 12.99, "thickness_mil": 4 },
  { "item_number": "GLV-2", "product_name": "Vinyl Gloves", "unit_cost": 8.50 }
]
```

**Output (parseJson):**
```json
{
  "rows": [
    { "sku": "GLV-1", "title": "Nitrile Gloves", "cost": 12.99, "thickness_mil": 4 },
    { "item_number": "GLV-2", "product_name": "Vinyl Gloves", "unit_cost": 8.5 }
  ],
  "format": "json",
  "rowCount": 2
}
```

## Attribute extraction (disposable gloves)

**Input row:** `{ "name": "Nitrile Exam Gloves Blue M", "material": "nitrile", "color": "Blue", "size": "M", "powder_free": "yes", "case_qty": 100 }`

**Output (extractGloveAttributes):**
```json
{
  "attributes": {
    "material": "nitrile",
    "color": "blue",
    "size": "M",
    "powder_free": true,
    "case_qty": 100,
    "product_type": "disposable_gloves"
  },
  "productTypeConfidence": 0.8
}
```

## API trigger

**POST /api/ingest**

By feed_id (URL read from DB):
```json
{ "feed_id": "uuid-of-supplier-feed" }
```

By supplier + URL:
```json
{ "supplier_id": "uuid-of-supplier", "feed_url": "https://example.com/products.csv" }
```

**Response (success):**
```json
{
  "batchId": "uuid",
  "supplierId": "uuid",
  "rawCount": 10,
  "normalizedCount": 10,
  "matchedCount": 3,
  "anomalyRowCount": 2,
  "rowResults": [ ... ],
  "errors": []
}
```
