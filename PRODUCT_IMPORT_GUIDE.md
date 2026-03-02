# Product Import Guide for Glovecubs

## Quick Start: Adding Products

You have **3 ways** to add products:

### Method 1: Admin Panel (Single Products)
1. Login as admin (`demo@company.com` / `demo123`)
2. Go to **Admin** → **Products** tab
3. Click **"Add New Product"**
4. Fill in the form and submit

### Method 2: CSV Import (Bulk Products) ⚡ RECOMMENDED
1. Open `products-template.csv` in Excel or Google Sheets
2. Add your products following the format
3. Save as CSV
4. Run: `node import-products.js your-file.csv`

### Method 3: Edit seed.js (Development)
1. Edit `seed.js` to add products to the array
2. Run: `npm run seed` (⚠️ This will reset your database)

---

## CSV Format

Your CSV must have these columns (in order):

```csv
sku,name,brand,category,subcategory,description,material,sizes,color,pack_qty,case_qty,price,bulk_price,image_url,in_stock,featured
```

### Column Descriptions:

- **sku**: Must start with `GLV-` followed by manufacturer item number (e.g., `GLV-GL-N105FX`)
- **name**: Full product name
- **brand**: One of: Hospeco, Global Glove, Safeko, Ambitex, SW Safety, MCR Safety, PIP, Wells Lamont, Ansell, SHOWA
- **category**: `Disposable Gloves` or `Work Gloves` (stored value; site displays "Reusable Work Gloves" for the latter)
- **subcategory**: Nitrile, Latex, Vinyl, Coated, Cut Resistant, Leather, etc.
- **description**: Product description (can include multiple sentences)
- **material**: Nitrile, Latex, Vinyl, Nylon/Nitrile, Leather, etc.
- **sizes**: Comma-separated: `S,M,L,XL` or `XS,S,M,L,XL,2XL`
- **color**: Blue, Black, White, Clear, Natural, Tan, Gray, etc.
- **pack_qty**: Quantity per box (usually 100 for disposable, 12 for work gloves)
- **case_qty**: Quantity per case (usually 1000 for disposable, 72-144 for work gloves)
- **price**: Retail price per box (e.g., `12.99`)
- **bulk_price**: B2B price per box (e.g., `9.99`)
- **image_url**: Full URL to product image (see Image Guide below)
- **in_stock**: `1` for in stock, `0` for out of stock
- **featured**: `1` to feature on homepage, `0` for normal

---

## Product Images Guide

### Option 1: Use Manufacturer Websites
1. Go to manufacturer's website (Hospeco, Global Glove, etc.)
2. Find the product page
3. Right-click product image → "Copy Image Address"
4. Paste URL into `image_url` column

**Example URLs:**
- Hospeco: `https://hospeco.com/products/gloves/nitrile-exam-gloves.jpg`
- Global Glove: `https://globalglove.com/images/panther-guard-705.jpg`

### Option 2: Use Placeholder.com (Temporary)
For testing, you can use placeholder images:

```
https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Blue+Nitrile+Gloves
```

**Format:** `https://via.placeholder.com/400x400/BACKGROUND/TEXTCOLOR?text=Product+Name`

**Color Codes:**
- Blue: `0066CC`
- Black: `000000`
- Orange: `FF7A00`
- Green: `00AA00`
- White: `FFFFFF`
- Gray: `666666`

### Option 3: Upload to Your Server
1. Upload images to your web server
2. Use full URL: `https://yourdomain.com/images/products/glove-001.jpg`

### Image Requirements:
- **Size**: 400x400px minimum (square recommended)
- **Format**: JPG or PNG
- **Background**: White or transparent preferred
- **File size**: Under 500KB for fast loading

---

## Manufacturers & Product Lines

### Hospeco
- **ProWorks** line (Nitrile, Latex, Vinyl)
- **SKU Format**: `GLV-GL-[item#]`
- **Website**: hospeco.com

### Global Glove
- **Panther-Guard** (Nitrile industrial)
- **Samurai** (Cut resistant)
- **FrogWear** (Coated work)
- **SKU Format**: `GLV-[item#]` (e.g., `GLV-705PFE`)

### Safeko
- **Nitrile Exam** (Premium)
- **Food Service** line
- **Vinyl Economy**
- **SKU Format**: `GLV-SAF-[item#]`

### MCR Safety
- **UltraTech** (Foam nitrile)
- **Cut Pro** (Cut resistant)
- **SKU Format**: `GLV-MCR-[item#]`

### PIP
- **MaxiFlex** series (Coated work gloves)
- **SKU Format**: `GLV-PIP-[item#]`

### Ansell
- **HyFlex** series (Lightweight coated)
- **SKU Format**: `GLV-ANS-[item#]`

### SHOWA
- **Atlas** series (Nitrile coated)
- **Biodegradable** options
- **SKU Format**: `GLV-SHW-[item#]`

### Wells Lamont
- **Leather** work gloves
- **SKU Format**: `GLV-WSL-[item#]`

### Ambitex
- **Nitrile Select** (Economy)
- **SKU Format**: `GLV-AMS-[item#]`

### SW Safety
- **Eco-friendly** options
- **SKU Format**: `GLV-SWS-[item#]`

---

## Example CSV Rows

```csv
sku,name,brand,category,subcategory,description,material,sizes,color,pack_qty,case_qty,price,bulk_price,image_url,in_stock,featured
GLV-GL-N105FX,ProWorks Nitrile Exam Gloves - Powder Free,Hospeco,Disposable Gloves,Nitrile,Premium quality nitrile exam gloves. Powder-free latex-free formula.,Nitrile,S M L XL,Blue,100,1000,12.99,9.99,https://hospeco.com/images/n105fx.jpg,1,1
GLV-705PFE,Panther-Guard Nitrile Gloves - Industrial,Global Glove,Disposable Gloves,Nitrile,Industrial grade 5 mil nitrile gloves with excellent chemical resistance.,Nitrile,S M L XL 2XL,Blue,100,1000,15.99,12.49,https://globalglove.com/images/705pfe.jpg,1,1
GLV-PIP-34874,MaxiFlex Ultimate Gloves,PIP,Work Gloves,Coated,Industry-leading coated work gloves with micro-foam nitrile.,Nylon/Nitrile,XS S M L XL 2XL 3XL,Gray/Black,12,144,48.99,38.99,https://pip.com/images/maxiflex-ultimate.jpg,1,1
```

---

## Importing Your CSV

1. **Save your CSV file** (e.g., `my-products.csv`)

2. **Run the import script:**
   ```bash
   node import-products.js my-products.csv
   ```

3. **Verify products:**
   - Go to your site: `http://localhost:3004`
   - Navigate to Products page
   - Check that your products appear

---

## Tips for Success

✅ **DO:**
- Use manufacturer item numbers in SKU (after `GLV-`)
- Include detailed descriptions
- Set realistic pricing (bulk_price should be 20-30% lower than price)
- Use real product images when possible
- Test with a few products first before bulk import

❌ **DON'T:**
- Skip the `GLV-` prefix in SKU
- Use duplicate SKUs
- Leave required fields empty
- Use very large image files (>1MB)

---

## Need Help?

- **Admin Panel**: Login and use the Products tab for single additions
- **CSV Template**: Use `products-template.csv` as a starting point
- **Image Issues**: Check that image URLs are publicly accessible

---

## Current Product Count

You currently have **20 products** from:
- Hospeco (4)
- Global Glove (6)
- Safeko (3)
- Ambitex (1)
- PIP (2)
- MCR Safety (1)
- Ansell (1)
- SHOWA (1)
- Wells Lamont (1)

**Target**: Add 50-100+ more products to reach 1,000+ SKUs!
