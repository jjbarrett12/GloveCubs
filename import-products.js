const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.json');

// Parse a single CSV line (handles quoted values with commas)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
}

// Read CSV file and import products
function importFromCSV(csvFilePath) {
    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const headerLower = headers.map(h => h.toLowerCase());
    const col = (name, alternates = []) => {
        const names = [name, ...(alternates || [])].map(n => n.toLowerCase());
        for (const n of names) {
            const i = headerLower.indexOf(n);
            if (i !== -1) return i;
        }
        return -1;
    };
    const getVal = (values, name, alternates, def = '') => {
        const i = col(name, alternates);
        if (i === -1) return def;
        const v = (values[i] || '').trim();
        return v !== undefined && v !== null ? v : def;
    };

    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    let maxId = db.products.length > 0 ? Math.max(...db.products.map(p => p.id)) : 0;
    const existingSkus = new Set(db.products.map(p => (p.sku || '').toString().trim().toLowerCase()));
    const skusSeenInCsv = new Set();
    let added = 0;
    let updated = 0;
    let skippedDuplicates = 0;

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.every(v => !(v || '').trim())) continue;

        const sku = (getVal(values, 'sku', [], '') || '').trim();
        const skuLower = sku.toLowerCase();
        if (!sku) continue;

        if (skusSeenInCsv.has(skuLower)) {
            skippedDuplicates++;
            continue;
        }
        skusSeenInCsv.add(skuLower);

        const productData = {
            sku,
            name: getVal(values, 'name', [], ''),
            brand: getVal(values, 'brand', [], ''),
            category: getVal(values, 'category', [], 'Disposable Gloves'),
            subcategory: getVal(values, 'subcategory', [], ''),
            description: getVal(values, 'description', [], ''),
            material: getVal(values, 'material', [], ''),
            sizes: getVal(values, 'sizes', ['size'], ''),
            color: getVal(values, 'color', [], ''),
            pack_qty: parseInt(getVal(values, 'pack_qty', ['pack qty', 'pack_qty'], '100')) || 100,
            case_qty: parseInt(getVal(values, 'case_qty', ['case qty', 'case_qty'], '1000')) || 1000,
            price: parseFloat(getVal(values, 'price', [], '0')) || 0,
            bulk_price: parseFloat(getVal(values, 'bulk_price', ['bulk price', 'bulk_price'], '0')) || 0,
            image_url: (() => {
                let url = getVal(values, 'image_url', ['image url', 'image', 'imageurl', 'url'], '').trim();
                if (url && !/^https?:\/\//i.test(url) && !url.startsWith('/')) url = '/' + url;
                return url || '';
            })(),
            in_stock: ['1', 'true', 'yes'].includes(getVal(values, 'in_stock', ['in stock', 'instock'], '').toLowerCase()) ? 1 : 0,
            featured: ['1', 'true', 'yes'].includes(getVal(values, 'featured', [], '').toLowerCase()) ? 1 : 0
        };

        const existing = db.products.find(p => (p.sku || '').toString().trim().toLowerCase() === skuLower);
        if (existing) {
            Object.assign(existing, productData);
            updated++;
        } else {
            db.products.push({ id: ++maxId, ...productData });
            added++;
        }
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

    console.log(`\n✅ Import complete: ${added} added, ${updated} updated.`);
    if (skippedDuplicates > 0) console.log(`   ${skippedDuplicates} duplicate SKU(s) in CSV were skipped.`);
    console.log(`   Total products in database: ${db.products.length}\n`);

    return { added, updated, skippedDuplicates };
}

// Get CSV file path from command line
const csvFile = process.argv[2];

if (!csvFile) {
    console.log('\n❌ Please provide a CSV file path');
    console.log('   Usage: node import-products.js products.csv\n');
    process.exit(1);
}

if (!fs.existsSync(csvFile)) {
    console.log(`\n❌ File not found: ${csvFile}\n`);
    process.exit(1);
}

try {
    importFromCSV(csvFile);
} catch (error) {
    console.error('\n❌ Error importing products:', error.message);
    process.exit(1);
}
