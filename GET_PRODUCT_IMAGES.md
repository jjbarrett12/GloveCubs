# How to Get Product Images

## Quick Guide: Finding Product Images

### Method 1: Manufacturer Websites (Best Quality)

1. **Hospeco** (hospeco.com)
   - Go to Products → Gloves
   - Find your product
   - Right-click image → "Copy Image Address"
   - Example: `https://hospeco.com/media/catalog/product/n105fx.jpg`

2. **Global Glove** (globalglove.com)
   - Navigate to product page
   - Copy image URL from product gallery

3. **Safeko** (safeko.com)
   - Product pages have high-res images
   - Use the main product image URL

4. **Other Manufacturers:**
   - **MCR Safety**: mcr safety.com
   - **PIP**: pipusa.com
   - **Ansell**: ansell.com
   - **SHOWA**: showagroup.com
   - **Wells Lamont**: welllamont.com

### Method 2: Google Image Search

1. Search: `[Brand] [Product Name] [SKU]`
   - Example: `Hospeco ProWorks N105FX`
2. Filter by "Large" images
3. Right-click → "Copy Image Address"
4. **⚠️ Check usage rights** - some images may be copyrighted

### Method 3: Manufacturer Catalogs/PDFs

1. Download product catalogs from manufacturer sites
2. Extract images from PDFs
3. Upload to your server
4. Use your server URL

### Method 4: Placeholder Images (Temporary)

For testing, use placeholder.com:

```
https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Product+Name
```

**Replace:**
- `FFFFFF` = Background color (white)
- `0066CC` = Text color (blue)
- `Product+Name` = Your product name (use + for spaces)

**Color Codes:**
- Blue: `0066CC`
- Black: `000000`
- Orange: `FF7A00`
- Green: `00AA00`
- White: `FFFFFF`
- Gray: `666666`
- Tan: `D2B48C`

---

## Image Requirements

✅ **Recommended:**
- **Size**: 400x400px to 800x800px (square)
- **Format**: JPG or PNG
- **Background**: White or transparent
- **File size**: Under 500KB
- **Quality**: High resolution, clear product photo

❌ **Avoid:**
- Blurry or low-resolution images
- Images with watermarks
- Images over 1MB (slow loading)
- Non-square images (will be cropped)

---

## Uploading Images to Your Server

If you want to host images yourself:

1. **Create folder**: `public/images/products/`
2. **Upload images**: Name them by SKU (e.g., `GLV-GL-N105FX.jpg`)
3. **Use URL**: `https://yourdomain.com/images/products/GLV-GL-N105FX.jpg`

---

## Quick Image URL Generator

For placeholder images, use this format:

```
https://via.placeholder.com/400x400/BGCOLOR/TEXTCOLOR?text=PRODUCT+NAME
```

**Example:**
- Blue Nitrile: `https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Blue+Nitrile`
- Black Nitrile: `https://via.placeholder.com/400x400/FFFFFF/000000?text=Black+Nitrile`
- Work Gloves: `https://via.placeholder.com/400x400/FFFFFF/666666?text=Work+Gloves`

---

## Batch Image Processing

If you have many images to process:

1. **Resize**: Use a tool like ImageMagick or online resizers
2. **Optimize**: Compress with TinyPNG or similar
3. **Rename**: Use SKU as filename for easy matching
4. **Upload**: Batch upload to your server

---

## Next Steps

1. **Start with 10-20 products** to test the import process
2. **Use placeholder images** initially to get products in the system
3. **Replace with real images** as you find them from manufacturers
4. **Bulk import** once you have a complete CSV with images

---

## Need Help?

- Check manufacturer websites for official product images
- Use placeholder.com for testing
- Contact manufacturers for high-res product images
- Consider hiring a designer to create consistent product images
