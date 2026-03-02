/**
 * CSV import into Supabase: row-fault-tolerant, upsert by SKU, sync manufacturers.
 * Returns { parsedRows, created, updated, failed, skipped, errorSamples }.
 * Only overwrites a field when incoming CSV value is non-empty.
 */

const productStore = require('./product-store');
const { getSupabase } = require('./supabase');

const MAX_ERROR_SAMPLES = 20;

function normalizeSku(s) {
    if (s == null || typeof s !== 'string') return '';
    return s.replace(/\s+/g, ' ').trim();
}

function isEmpty(v) {
    if (v == null) return true;
    if (typeof v === 'string') return !v.trim();
    return false;
}

/**
 * @returns {{ parsedRows, created, updated, failed, skipped, errorSamples: Array<{ row: number, sku?: string, message: string }> }}
 */
async function importCsvToSupabase(csvContent) {
    const result = {
        parsedRows: 0,
        created: 0,
        updated: 0,
        failed: 0,
        skipped: 0,
        errorSamples: []
    };

    const supabase = getSupabase();
    if (!supabase) {
        result.errorSamples.push({ row: 0, message: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
        return result;
    }

    let content = csvContent;
    if (content && content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    const lines = (content || '').split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
        result.errorSamples.push({ row: 0, message: 'CSV must have header and at least one data row.' });
        return result;
    }

    const delimiter = productStore.detectDelimiter(lines[0]);
    const parseLine = (line) =>
        productStore.parseCSVLine(line, delimiter).map(v => (v || '').replace(/^"|"$/g, '').trim());
    const headers = parseLine(lines[0]).map(h => (h || '').replace(/^\ufeff/, '').trim());
    const { getVal, col } = productStore.buildHeaderLookup(headers);
    const headerCount = headers.length;
    const dataRowCount = lines.length - 1;
    result.parsedRows = dataRowCount;

    const successfulProducts = []; // { sku, brand } for manufacturer sync

    for (let i = 1; i < lines.length; i++) {
        const lineNum = i + 1;
        const values = parseLine(lines[i]);

        if (values.length < headerCount) {
            result.skipped++;
            if (result.errorSamples.length < MAX_ERROR_SAMPLES) {
                result.errorSamples.push({ row: lineNum, message: 'Too few columns' });
            }
            continue;
        }
        if (values.every(v => !(v || '').trim())) {
            result.skipped++;
            continue;
        }

        const row = productStore.rowToProductForSupabase(values, getVal, col, headers, { headerCount });
        if (!row) {
            result.failed++;
            const skuRaw = normalizeSku(getVal(values, 'sku', ['product_sku', 'item_number', 'part_number'], ''));
            if (result.errorSamples.length < MAX_ERROR_SAMPLES) {
                result.errorSamples.push({ row: lineNum, sku: skuRaw || undefined, message: 'Missing required SKU or name' });
            }
            continue;
        }

        const sku = normalizeSku(row.sku);
        if (!sku) {
            result.failed++;
            if (result.errorSamples.length < MAX_ERROR_SAMPLES) {
                result.errorSamples.push({ row: lineNum, message: 'Empty SKU after trim' });
            }
            continue;
        }

        try {
            const { data: existingRows } = await supabase.from('products').select('id, sku, name, brand, cost, image_url').eq('sku', sku).limit(1);
            const existing = existingRows && existingRows[0];

            const payload = {
                sku,
                name: row.name || '',
                brand: row.brand != null && row.brand !== '' ? row.brand : (existing ? existing.brand : ''),
                cost: row.cost != null && row.cost !== '' && !Number.isNaN(Number(row.cost)) ? Number(row.cost) : (existing ? Number(existing.cost) : 0),
                image_url: !isEmpty(row.image_url) ? row.image_url : (existing ? existing.image_url : null),
                updated_at: new Date().toISOString()
            };

            if (existing) {
                const { error } = await supabase.from('products').update(payload).eq('id', existing.id);
                if (error) throw error;
                result.updated++;
            } else {
                payload.created_at = new Date().toISOString();
                const { error } = await supabase.from('products').insert(payload);
                if (error) throw error;
                result.created++;
            }
            successfulProducts.push({ sku, brand: payload.brand || '' });
        } catch (err) {
            result.failed++;
            if (result.errorSamples.length < MAX_ERROR_SAMPLES) {
                result.errorSamples.push({
                    row: lineNum,
                    sku,
                    message: (err && err.message) || String(err)
                });
            }
        }
    }

    // Upsert manufacturers from distinct brands (trim / normalize)
    const brandSet = new Set();
    successfulProducts.forEach(p => {
        const b = (p.brand || '').trim().replace(/\s+/g, ' ');
        if (b) brandSet.add(b);
    });

    const brandToId = {};
    for (const brandName of brandSet) {
        try {
            const { data: existing } = await supabase.from('manufacturers').select('id, name').eq('name', brandName).limit(1).single();
            if (existing) {
                brandToId[brandName] = existing.id;
            } else {
                const { data: inserted, error } = await supabase.from('manufacturers').insert({ name: brandName }).select('id').single();
                if (!error && inserted) brandToId[brandName] = inserted.id;
            }
        } catch (_) {
            // ignore per-brand failure
        }
    }

    // Backfill products.manufacturer_id
    for (const p of successfulProducts) {
        const brand = (p.brand || '').trim().replace(/\s+/g, ' ');
        const mfrId = brand ? brandToId[brand] : null;
        if (mfrId != null) {
            try {
                await supabase.from('products').update({ manufacturer_id: mfrId, updated_at: new Date().toISOString() }).eq('sku', p.sku);
            } catch (_) {}
        }
    }

    return result;
}

module.exports = { importCsvToSupabase };
