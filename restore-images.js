/**
 * Restore product images from database_backup.json to Supabase
 */
require('dotenv').config();
const fs = require('fs');
const catalogService = require('./services/catalogService');

async function restoreImages() {
  
  // Load backup (strip BOM if present)
  let content = fs.readFileSync('./database_backup.json', 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  const backup = JSON.parse(content);
  const products = backup.products || [];
  
  console.log(`Found ${products.length} products in backup`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const product of products) {
    if (!product.sku || !product.image_url) {
      skipped++;
      continue;
    }
    
    // Skip placeholders
    if (product.image_url.includes('placeholder') || product.image_url.includes('unsplash')) {
      skipped++;
      continue;
    }
    
    try {
      const existing = await catalogService.getProductBySkuForWrite(product.sku);
      if (existing && existing.ambiguous) {
        console.log(`Ambiguous SKU ${product.sku}; skip`);
        errors++;
        continue;
      }
      if (!existing || !existing.id) {
        skipped++;
        continue;
      }
      await catalogService.updateProduct(existing.id, {
        image_url: product.image_url,
        images: product.images || [],
      });
      console.log(`Updated ${product.sku}: ${product.image_url.substring(0, 60)}...`);
      updated++;
    } catch (e) {
      console.log(`Exception for ${product.sku}: ${e.message}`);
      errors++;
    }
  }
  
  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
}

restoreImages().catch(console.error);
