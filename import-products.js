/**
 * CLI to import products from a CSV file into database.json.
 * Uses the same parsing and mapping as the API (lib/product-store.js).
 *
 * Usage:
 *   node import-products.js <file.csv> [--replace]
 *
 * --replace  Remove any existing products whose SKU is not in the CSV (full catalog replace).
 */

const fs = require('fs');
const path = require('path');
const productStore = require('./lib/product-store');

const DB_PATH = path.join(__dirname, 'database.json');

function loadDB() {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const db = JSON.parse(raw);
    if (!db.products) db.products = [];
    return db;
}

function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function importFromCSV(csvFilePath, options = {}) {
    const { deleteNotInImport = false } = options;
    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    const db = loadDB();

    const result = productStore.upsertProductsFromCsv(db, csvContent, { deleteNotInImport });
    const { created, updated, skipped, failed, deleted, withImage } = result;

    saveDB(db);

    console.log(`\n✅ Import complete: ${created} created, ${updated} updated.`);
    if (deleted > 0) console.log(`   ${deleted} product(s) removed (not in CSV).`);
    if (skipped > 0) console.log(`   ${skipped} row(s) skipped (empty or too few columns).`);
    if (failed > 0) console.log(`   ${failed} row(s) failed (missing/invalid required fields).`);
    if (withImage > 0) console.log(`   ${withImage} row(s) had image URLs.`);
    console.log(`   Total products in database: ${db.products.length}\n`);

    return result;
}

// Parse args: first non-flag is CSV path; --replace enables deleteNotInImport
const args = process.argv.slice(2);
const csvFile = args.find(a => !a.startsWith('--'));
const deleteNotInImport = args.includes('--replace');

if (!csvFile) {
    console.log('\n❌ Please provide a CSV file path');
    console.log('   Usage: node import-products.js <file.csv> [--replace]');
    console.log('   --replace  Remove products not in the CSV (full catalog replace)\n');
    process.exit(1);
}

if (!fs.existsSync(csvFile)) {
    console.log(`\n❌ File not found: ${csvFile}\n`);
    process.exit(1);
}

try {
    importFromCSV(csvFile, { deleteNotInImport });
} catch (error) {
    console.error('\n❌ Error importing products:', error.message);
    process.exit(1);
}
