/**
 * CLI to import products from a CSV file into Supabase.
 * Uses the same parsing and mapping as the API (lib/import-csv-supabase).
 *
 * Usage:
 *   node import-products.js <file.csv> [--replace]
 *
 * --replace  Remove any existing products whose SKU is not in the CSV (full catalog replace).
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or environment).
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { importCsvToSupabase } = require('./lib/import-csv-supabase');
const { isConfigured } = require('./lib/supabase');

async function importFromCSV(csvFilePath, options = {}) {
    const { deleteNotInImport = false } = options;

    if (!isConfigured()) {
        console.error('\n❌ Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env\n');
        process.exit(1);
    }

    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    const result = await importCsvToSupabase(csvContent, { deleteNotInImport });

    const { created, updated, skipped, failed, deleted, parsedRows, errorSamples } = result;
    let withImage = 0;
    if (result.withImage != null) withImage = result.withImage;

    console.log('\n✅ Import complete:');
    console.log(`   Created: ${created} | Updated: ${updated}`);
    if (deleted > 0) console.log(`   Deleted (not in CSV): ${deleted}`);
    if (skipped > 0) console.log(`   Skipped: ${skipped} row(s)`);
    if (failed > 0) console.log(`   Failed: ${failed} row(s)`);
    if (withImage > 0) console.log(`   With image URLs: ${withImage}`);
    if (errorSamples && errorSamples.length > 0) {
        console.log('\n   Sample errors:');
        errorSamples.slice(0, 5).forEach((e) => {
            console.log(`     Row ${e.row}${e.sku ? ` SKU ${e.sku}` : ''}: ${e.message}`);
        });
    }
    console.log(`   Total rows in CSV: ${parsedRows}\n`);

    return result;
}

// Parse args: first non-flag is CSV path; --replace enables deleteNotInImport
const args = process.argv.slice(2);
const csvFile = args.find((a) => !a.startsWith('--'));
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

importFromCSV(csvFile, { deleteNotInImport }).catch((err) => {
    console.error('\n❌ Error importing products:', err.message);
    process.exit(1);
});
