# Supplier Feed Upload Tool

## Overview

The Supplier Feed Upload tool allows suppliers to bulk upload product offers through CSV, XLSX, or price sheet files. The system processes uploads through a pipeline of parsing, AI extraction, normalization, and validation before allowing suppliers to preview, correct, and commit their offers.

## Pipeline Stages

```
Upload → Parse → Extract → Normalize → Validate → Preview → Correct → Commit
```

### 1. Upload
- Drag-and-drop or file picker interface
- Accepts CSV, XLSX, and other price sheet formats
- Maximum 5,000 rows per upload

### 2. Parse
- CSV parsing with proper quote/comma handling
- Header normalization (lowercase, underscore-separated)
- Row extraction and validation

### 3. Extract
- Field mapping from common column names
- Price parsing with currency symbol removal
- Material, size, and pack size inference from product names
- Confidence scoring for each extracted field

### 4. Normalize & Match
- **Exact SKU Match**: 100% confidence when SKU matches catalog
- **Fuzzy Name Match**: Token-based similarity scoring
- **Attribute Match**: Material + size combination matching
- Price per unit calculation
- Pack size normalization

### 5. Validate
Checks for:
- **Missing Required Fields**: Price is always required
- **Price Anomalies**: >50% deviation from market average
- **Pack Mismatches**: Case pack differs from common sizes
- **Duplicates**: Existing active offer for same product
- **Low Confidence**: Extraction confidence below 70%

### 6. Preview
Suppliers see:
- Total row counts by status (valid/warning/error)
- Row-by-row preview with extracted fields
- Match method and confidence indicators
- Warning and error details
- Selectable rows for commit

### 7. Correct
Before committing, suppliers can:
- Edit any extracted field
- Re-trigger normalization and validation
- Resolve warnings and errors

### 8. Commit
- Creates new offers or updates existing ones
- Audit logged for all changes
- Summary of created/updated/skipped offers

## Field Mappings

The system recognizes these column headers:

| Field | Recognized Headers |
|-------|-------------------|
| SKU | sku, item_number, product_code, part_number, upc |
| Product Name | product_name, name, description, item_name, title |
| Price | price, unit_price, cost, list_price, sell_price |
| Case Pack | case_pack, pack_size, units_per_case, qty_per_case |
| Box Quantity | box_quantity, box_qty, boxes_per_case, inner_pack |
| Unit | unit, uom, unit_of_measure |
| Material | material, composition, type |
| Size | size, glove_size, dimensions |
| Lead Time | lead_time, lead_time_days, delivery_days |
| MOQ | moq, min_order, minimum_order |

## AI Extraction

When direct column mapping fails, the system attempts AI extraction from the product name:

- **Material**: Extracts "nitrile", "latex", "vinyl", etc.
- **Size**: Extracts "XS", "S", "M", "L", "XL", "XXL"
- **Pack Size**: Extracts patterns like "100ct", "200/case"

Confidence scores are reduced for AI-extracted values (typically 70-85%).

## Validation Warnings

| Warning Type | Description |
|--------------|-------------|
| `price_anomaly` | Price significantly differs from market average |
| `pack_mismatch` | Case pack differs from common sizes for this product |
| `duplicate` | Active offer already exists (will be updated) |
| `low_confidence` | Extraction or match confidence below threshold |

## Validation Errors

| Error Type | Description |
|------------|-------------|
| `missing_required` | Price or product identifier missing |
| `invalid_format` | Field format cannot be parsed |
| `no_match` | Cannot match to any catalog product |
| `parse_error` | Row cannot be parsed |

## Database Schema

### supplier_feed_uploads
Tracks upload jobs with status, progress, and error information.

### supplier_feed_upload_rows
Stores parsed rows with extracted data, normalized matches, and validation results for preview and correction.

## API Endpoints

### POST /supplier-portal/api/feed-upload (multipart)
Upload a file for processing.

### GET /supplier-portal/api/feed-upload?action=status&upload_id=X
Get upload status and progress.

### GET /supplier-portal/api/feed-upload?action=rows&upload_id=X&filter=Y
Get processed rows (filter: all/valid/warning/error).

### POST /supplier-portal/api/feed-upload (JSON)
Actions:
- `correct`: Update a row with corrections
- `commit`: Commit selected rows as offers

## Security

- All uploads scoped to authenticated supplier
- RLS policies enforce supplier isolation
- Audit logging for all commits
- Old uploads cleaned up after 7 days

## Usage Example

1. Navigate to `/supplier-portal/upload`
2. Drag CSV file into drop zone
3. Wait for processing (parsing, extraction, normalization)
4. Review rows in preview table
5. Click rows with warnings to view/correct
6. Select rows to commit
7. Click "Commit Selected Offers"
8. View results and navigate to Offers page

## Future Enhancements

- XLSX native parsing (currently requires CSV conversion)
- Batch product matching with LLM assistance
- Template downloads with expected headers
- Historical upload history view
- Undo/rollback for committed uploads
