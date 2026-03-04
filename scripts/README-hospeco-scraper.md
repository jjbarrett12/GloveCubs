# Hospeco Image URL Enricher (XLSX)

TypeScript script that enriches an **Excel (XLSX)** file of Hospeco items by searching [hospecobrands.com](https://www.hospecobrands.com) for each item number (in **Column A**) and extracting **all product image URLs** from the product page. Uses **Playwright (Chromium)** so it works even when search results or galleries are rendered via JavaScript.

## Output

- **New columns appended (right side):**
  - `Image_1` … `Image_5` — up to 5 image URLs per product
  - `Image_URLs` — all image URLs, separated by ` | ` (space-pipe-space)
  - `Hospeco_Product_URL` — product page URL

- **Files written:**
  - **XLSX** at `--out` (all original columns preserved + new image columns)
  - **CSV** copy at same path with `.csv` extension (e.g. `data/PPV_Hospeco -BF - with images.csv`)

- **Failures:** Rows where no product or images are found get blank image columns; failures are logged to `data/hospeco-scrape-failures.txt` with lines: `ITEM | reason`.

## How to run

### 1. Install dependencies

```bash
npm i
```

### 2. Install Playwright Chromium (one-time)

```bash
npx playwright install chromium
```

### 3. Run the scraper

**Default input/output** (input: `data/PPV_Hospeco -BF.xlsx`, output: `data/PPV_Hospeco -BF - with images.xlsx`, sheet index `0`):

```bash
npm run scrape:hospeco
```

**Windows PowerShell** (pass arguments after `--`):

```powershell
npm run scrape:hospeco -- --in "data\PPV_Hospeco -BF.xlsx" --out "data\PPV_Hospeco -BF - with images.xlsx" --sheet 0
```

With custom delay and headless:

```powershell
npm run scrape:hospeco -- --in "data\PPV_Hospeco -BF.xlsx" --out "data\PPV_Hospeco -BF - with images.xlsx" --sheet 0 --delayMs 800 --headless true
```

### CLI options

| Option       | Default                              | Description                          |
|-------------|---------------------------------------|--------------------------------------|
| `--in`      | `data/PPV_Hospeco -BF.xlsx`           | Input XLSX path                      |
| `--out`     | `data/PPV_Hospeco -BF - with images.xlsx` | Output XLSX path                 |
| `--sheet`   | `0`                                  | Sheet index (number) or sheet name   |
| `--headless`| `true`                               | Run browser headless                 |
| `--delayMs` | `800`                                | Delay in ms between items            |

## XLSX behavior

- **Column A** is always the item number column (no autodetect).
- If the first cell in Column A (A1) looks like a header (contains "item", "sku", or "part"), that row is treated as a header and data starts from row 2.
- Rows with empty Column A are skipped (image columns left blank).
- All original columns and rows are preserved; new columns are appended on the right.
- A **CSV** file with the same base name as the output is also written for convenience.

## Requirements

- **Node 18+**
- **tsx**, **playwright**, **xlsx** (installed via `npm i` and `npx playwright install chromium`)

## Behavior

- One browser context for the whole run; rate-limited requests between items (default 800 ms).
- **One retry** per item if the first attempt fails to find a product or images.
- Multiple CSS selectors for search result links and gallery images; JSON-LD and `og:image` fallbacks.
- Image attributes read: `src`, `data-src`, `data-large-image`, `data-zoom-image`, `data-original`.
- Thumbnails/low-res filtered: URLs containing `swatch`, `thumbnail`, `small_image`, `cache`; width/height &lt; 200 when present.
- Exit code 0 even if some rows fail; summary (total, found, not found, errors, output paths) is printed at the end.
