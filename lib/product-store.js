/**
 * Product store: CSV import/export and upsert logic.
 * Single source of truth for product CSV format and mapping.
 * Used by server.js (API import/export) and import-products.js (CLI).
 * Future: Fishbowl catalog sync can plug in here (same product shape).
 */

// Export column order — keep in sync with rowToProduct and import mapping
const EXPORT_HEADERS = [
    'sku', 'name', 'brand', 'category', 'subcategory', 'description', 'material',
    'powder', 'thickness', 'sizes', 'color', 'grade', 'useCase', 'certifications',
    'texture', 'cuffStyle', 'sterility', 'pack_qty', 'case_qty', 'price', 'bulk_price',
    'image_url', 'in_stock', 'featured', 'industry'
];

function parseCSVLine(line, delimiter = ',') {
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
        } else if (char === delimiter && !inQuotes) {
            result.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
}

function detectDelimiter(firstLine) {
    if (typeof firstLine !== 'string') return ',';
    return firstLine.indexOf(';') !== -1 && firstLine.indexOf(',') === -1 ? ';' : ',';
}

const toKey = (h) => (h || '').toLowerCase().replace(/\s+/g, ' ').trim();

function buildHeaderLookup(headers) {
    const headerKeys = headers.map(toKey);
    const col = (name, alternates = []) => {
        const names = [name, ...(alternates || [])].map(toKey);
        for (const n of names) {
            const i = headerKeys.indexOf(n);
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
    return { col, getVal, headerKeys };
}

// SKU column alternates (import accepts many header names)
const SKU_ALTERNATES = ['product_sku', 'item_number', 'item no', 'part_number', 'part number', 'product code', 'item code'];
const NAME_ALTERNATES = ['product name', 'product_name', 'title', 'product', 'item name'];
const BRAND_ALTERNATES = ['manufacturer', 'maker', 'vendor', 'supplier', 'brand name', 'mfr'];
const IMAGE_ALTERNATES = ['image url', 'image', 'imageurl', 'url', 'photo', 'picture'];
const USE_CASE_ALTERNATES = ['use case', 'usecase', 'industry', 'industries'];

/**
 * Map one CSV row to a product object. Returns null if required fields (sku, name, brand, material, price) are missing.
 */
function rowToProduct(values, getVal, col, headers, options = {}) {
    const { headerCount } = options;
    const len = values.length;
    const sku = (getVal(values, 'sku', SKU_ALTERNATES, '') || '').trim();
    if (!sku) return null;

    const name = getVal(values, 'name', NAME_ALTERNATES);
    const brand = getVal(values, 'brand', BRAND_ALTERNATES);
    const material = getVal(values, 'material', ['materials', 'material type']);
    const price = parseFloat(getVal(values, 'price', ['unit price', 'unit_price', 'list price', 'list_price', 'unit cost', 'msrp'], '0')) || 0;
    if (!name || !brand || !material || !price) return null;

    // image_url: handle multi-column URLs or column by name
    let imageUrl = '';
    const iImage = col('image_url', IMAGE_ALTERNATES);
    if (iImage >= 0 && headerCount != null && len > headerCount) {
        imageUrl = values.slice(iImage, len - 2).map(v => (v || '').trim()).join(',').trim();
    }
    if (!imageUrl) imageUrl = getVal(values, 'image_url', IMAGE_ALTERNATES).trim();
    if (!imageUrl || !imageUrl.toLowerCase().startsWith('http')) {
        for (let j = 0; j < len; j++) {
            const v = (values[j] || '').trim();
            if (v.toLowerCase().startsWith('http')) {
                const parts = [v];
                let k = j + 1;
                while (k < len) {
                    const next = (values[k] || '').trim();
                    if (next === '0' || next === '1' || /^(true|yes|false|no)$/i.test(next)) break;
                    parts.push(next);
                    k++;
                }
                imageUrl = parts.join(',').trim();
                break;
            }
        }
    }
    if (imageUrl && !/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith('/')) {
        imageUrl = '/' + imageUrl;
    }

    const inStockVal = headerCount != null && len > headerCount
        ? (values[len - 2] || '').trim()
        : getVal(values, 'in_stock', ['in stock', 'instock', 'stock', 'available', 'availability'], '');
    const featuredVal = headerCount != null && len > headerCount
        ? (values[len - 1] || '').trim()
        : getVal(values, 'featured', ['feature'], '');

    return {
        sku,
        name,
        brand,
        category: getVal(values, 'category', ['product category', 'type', 'product type'], 'Disposable Gloves'),
        subcategory: getVal(values, 'subcategory', ['sub_category', 'sub category']),
        description: getVal(values, 'description', ['product description', 'desc']),
        material,
        powder: getVal(values, 'powder', ['powdered', 'powder free']),
        thickness: (() => {
            const t = getVal(values, 'thickness', ['thickness (mil)', 'mil']);
            return t ? parseFloat(t) : null;
        })(),
        sizes: getVal(values, 'sizes', ['size', 'sizing', 'size_options', 'sizes available']),
        color: getVal(values, 'color', ['colour', 'colors']),
        grade: getVal(values, 'grade', ['grade type']),
        useCase: getVal(values, 'useCase', USE_CASE_ALTERNATES),
        certifications: getVal(values, 'certifications', ['compliance', 'certification']),
        texture: getVal(values, 'texture', []),
        cuffStyle: getVal(values, 'cuffStyle', ['cuff style', 'cuffstyle', 'cuff']),
        sterility: getVal(values, 'sterility', []),
        pack_qty: parseInt(getVal(values, 'pack_qty', ['pack qty', 'pack_qty', 'packqty', 'box_qty', 'per box', 'qty per box'], '100')) || 100,
        case_qty: parseInt(getVal(values, 'case_qty', ['case qty', 'case_qty', 'caseqty', 'case_size', 'case size'], '1000')) || 1000,
        price,
        bulk_price: parseFloat(getVal(values, 'bulk_price', ['bulk price', 'bulk_price', 'wholesale', 'wholesale_price', 'wholesale price'], '0')) || 0,
        image_url: imageUrl,
        in_stock: ['1', 'true', 'yes'].includes(String(inStockVal).toLowerCase()) ? 1 : 0,
        featured: ['1', 'true', 'yes'].includes(String(featuredVal).toLowerCase()) ? 1 : 0
    };
}

/**
 * Parse CSV content and upsert products into db.products. Mutates db.
 * @param {object} db - Full DB object (must have db.products array)
 * @param {string} csvContent - Raw CSV string (with optional BOM)
 * @param {object} options - { deleteNotInImport: boolean }
 * @returns {{ added, updated, deleted, skippedDuplicates, withImage, skusInImport, debug? }}
 */
function upsertProductsFromCsv(db, csvContent, options = {}) {
    const { deleteNotInImport = false } = options;
    let content = csvContent;
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
        return { added: 0, updated: 0, deleted: 0, skippedDuplicates: 0, withImage: 0, skusInImport: new Set() };
    }

    const delimiter = detectDelimiter(lines[0]);
    const parseLine = (line) => parseCSVLine(line, delimiter).map(v => (v || '').replace(/^"|"$/g, '').trim());
    const headers = parseLine(lines[0]).map(h => (h || '').replace(/^\ufeff/, '').trim());
    const { getVal, col } = buildHeaderLookup(headers);
    const headerCount = headers.length;

    let maxId = (db.products && db.products.length) ? Math.max(...db.products.map(p => p.id)) : 0;
    const skusInImport = new Set();
    const skusSeenInThisImport = new Set();
    let added = 0, updated = 0, withImage = 0, skippedDuplicates = 0;

    for (let i = 1; i < lines.length; i++) {
        const values = parseLine(lines[i]);
        if (values.length < headerCount) continue;
        if (values.every(v => !(v || '').trim())) continue;

        const skuLower = (getVal(values, 'sku', SKU_ALTERNATES, '') || '').trim().toLowerCase();
        if (!skuLower) continue;
        if (skusSeenInThisImport.has(skuLower)) {
            skippedDuplicates++;
            continue;
        }
        skusSeenInThisImport.add(skuLower);

        const data = rowToProduct(values, getVal, col, headers, { headerCount });
        if (!data) continue;

        if (data.image_url) withImage++;
        skusInImport.add(skuLower);

        const existing = (db.products || []).find(p => (p.sku || '').toString().trim().toLowerCase() === skuLower);
        if (existing) {
            Object.assign(existing, data);
            updated++;
        } else {
            if (!db.products) db.products = [];
            db.products.push({ id: ++maxId, ...data });
            added++;
        }
    }

    let deleted = 0;
    if (deleteNotInImport && skusInImport.size > 0 && Array.isArray(db.products)) {
        const before = db.products.length;
        db.products = db.products.filter(p => skusInImport.has((p.sku || '').toString().trim().toLowerCase()));
        deleted = before - db.products.length;
    }

    return { added, updated, deleted, skippedDuplicates, withImage, skusInImport };
}

/**
 * Build CSV string and suggested filename from product list.
 * @param {array} products - Array of product objects
 * @returns {{ csvContent: string, filename: string }}
 */
function productsToCsv(products) {
    const list = Array.isArray(products) ? products : [];
    const escapeCsv = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
        return s;
    };
    const row = (p) => [
        escapeCsv(p.sku || ''),
        escapeCsv(p.name || ''),
        escapeCsv(p.brand || ''),
        escapeCsv(p.category || ''),
        escapeCsv(p.subcategory || ''),
        escapeCsv(p.description || ''),
        escapeCsv(p.material || ''),
        escapeCsv(p.powder || ''),
        p.thickness ?? '',
        escapeCsv(p.sizes || ''),
        escapeCsv(p.color || ''),
        escapeCsv(p.grade || ''),
        escapeCsv(p.useCase || ''),
        escapeCsv(p.certifications || ''),
        escapeCsv(p.texture || ''),
        escapeCsv(p.cuffStyle || ''),
        escapeCsv(p.sterility || ''),
        p.pack_qty ?? 100,
        p.case_qty ?? 1000,
        p.price ?? 0,
        p.bulk_price ?? 0,
        escapeCsv(p.image_url || ''),
        p.in_stock ? 1 : 0,
        p.featured ? 1 : 0,
        escapeCsv(p.industry || '')
    ];
    const csvRows = [EXPORT_HEADERS.join(',')].concat(list.map(p => row(p).join(',')));
    const csvContent = csvRows.join('\n');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `glovecubs-products-export-${dateStr}.csv`;
    return { csvContent, filename };
}

/**
 * Future: sync product catalog from Fishbowl (parts → products).
 * Placeholder for when you want to pull part numbers, descriptions, and costs from Fishbowl
 * and create/update Glovecubs products. Would use fishbowl.js API and upsert into db.products.
 */
// function syncProductCatalogFromFishbowl(db, fishbowlClient, options) { ... }

module.exports = {
    EXPORT_HEADERS,
    parseCSVLine,
    detectDelimiter,
    buildHeaderLookup,
    rowToProduct,
    upsertProductsFromCsv,
    productsToCsv
};
