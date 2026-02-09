# Product Import Guide

There are **3 easy ways** to add products to Glovecubs:

## Method 1: Admin Panel (Easiest for Single Products) ⭐

1. **Login** to your account (must be approved/admin)
2. Click **"Admin"** in the navigation menu
3. Fill out the product form
4. Click **"Add Product"**

**Best for:** Adding 1-5 products at a time

---

## Method 2: CSV Bulk Import (Best for Many Products) ⭐⭐⭐

### Step 1: Open the Template
- Open `products-template.csv` in Excel or Google Sheets
- You'll see example products with all the columns

### Step 2: Add Your Products
- Copy the example row(s)
- Fill in your product information:
  - **sku**: Must start with `GLV-` (e.g., `GLV-HOS-N105FX`)
  - **name**: Full product name
  - **brand**: Manufacturer name (Hospeco, Global Glove, etc.)
  - **category**: `Disposable Gloves` or `Work Gloves`
  - **subcategory**: Nitrile, Latex, Coated, Cut Resistant, etc.
  - **description**: Product description
  - **material**: Nitrile, Latex, Vinyl, Nylon/Nitrile, etc.
  - **sizes**: Comma-separated (e.g., `S,M,L,XL`)
  - **color**: Blue, Black, Orange, etc.
  - **pack_qty**: Items per box (usually 100 for disposable, 12 for work gloves)
  - **case_qty**: Items per case
  - **price**: Retail price (e.g., `12.99`)
  - **bulk_price**: B2B price (e.g., `9.99`)
  - **image_url**: URL to product image (use placeholder.com if needed)
  - **in_stock**: `1` for yes, `0` for no
  - **featured**: `1` to feature on homepage, `0` for no

### Step 3: Save as CSV
- Save your file as `my-products.csv` (or any name)

### Step 4: Import
```bash
node import-products.js my-products.csv
```

**Best for:** Adding 10+ products at once

---

## Method 3: Edit seed.js (For Developers)

1. Open `seed.js`
2. Add products to the `products` array
3. Run: `node seed.js`

**Note:** This will **replace** all existing products. Use with caution!

---

## Quick Tips

### Image URLs

**Option 1: Use Placeholder.com (Quick & Easy)**
If you don't have product images yet, use placeholder.com:
```
https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Product+Name
```
- Change `0066CC` to your brand color (hex code, no #)
- Change `Product+Name` to your product name (use + for spaces)
- Example: `https://via.placeholder.com/400x400/FFFFFF/FF6B00?text=Blue+Nitrile+Gloves`

**Option 2: Use Your Own Images**
- Upload images to your server or image hosting service
- Use the full URL: `https://yourdomain.com/images/product.jpg`
- Recommended size: 400x400 pixels or larger
- White background works best

**Option 3: Use Unsplash (Free Stock Photos)**
```
https://images.unsplash.com/photo-[ID]?w=400&h=400&fit=crop&bg=white
```
- Search for glove images on Unsplash
- Copy the image URL and add `&w=400&h=400&fit=crop&bg=white` parameters

**Quick Image Generator:**
For placeholder images, you can also use this format:
- Blue nitrile: `https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Blue+Nitrile`
- Black nitrile: `https://via.placeholder.com/400x400/FFFFFF/000000?text=Black+Nitrile`
- Orange work gloves: `https://via.placeholder.com/400x400/FFFFFF/FF6B00?text=Work+Gloves`

### SKU Format
Always start with `GLV-` followed by manufacturer code:
- `GLV-GL-N105FX` (Global Glove)
- `GLV-HOS-N100` (Hospeco)
- `GLV-SAF-V200` (Safeko)

### Required Fields
- SKU
- Name
- Brand
- Category
- Material
- Price

All other fields are optional but recommended.

---

## Example CSV Row

```csv
GLV-TEST-001,Blue Nitrile Gloves,Hospeco,Disposable Gloves,Nitrile,Premium nitrile exam gloves,Nitrile,S M L XL,Blue,100,1000,12.99,9.99,https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Blue+Nitrile,1,1
```

## Image URL Quick Reference

### Common Color Codes for Placeholder Images:
- **Blue**: `0066CC` (for nitrile gloves)
- **Black**: `000000` (for black nitrile/industrial)
- **Orange**: `FF6B00` (matches your brand color)
- **Green**: `00AA00` (for cut-resistant work gloves)
- **Gray**: `666666` (for work gloves)
- **White**: `FFFFFF` (background, not text color)

### Quick Image URL Generator:
Use this format in Excel/CSV:
```
https://via.placeholder.com/400x400/FFFFFF/[COLOR]?text=[PRODUCT+NAME]
```

**Examples:**
- Blue Nitrile: `https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Blue+Nitrile`
- Black Industrial: `https://via.placeholder.com/400x400/FFFFFF/000000?text=Black+Nitrile`
- Work Gloves: `https://via.placeholder.com/400x400/FFFFFF/FF6B00?text=Work+Gloves`
- Cut Resistant: `https://via.placeholder.com/400x400/FFFFFF/00AA00?text=Cut+Resistant`

**Tip:** In the Admin Panel, click "Generate Placeholder" button to auto-create image URLs!

---

## Need Help?

- Check `products-template.csv` for examples
- All products are saved to `database.json`
- Restart server after CSV import to see changes
