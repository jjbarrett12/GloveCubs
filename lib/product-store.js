/**
 * Product store: CSV parsing, mapping, and export helpers.
 * Single source of truth for product CSV format and mapping.
 * Used by server.js (API export), import-csv-supabase.js (import), and import-products.js (CLI).
 * No persistence logic; all writes go through Supabase.
 */

// Export column order: matches importer mapping exactly for round-trip. No internal id; manufacturer_id allowed for join.
// Required for import: sku, name, brand, cost, image_url. manufacturer_id for pricing; manufacturer_name computed (read-only on re-import).
const EXPORT_HEADERS = [
    'sku',
    'name',
    'brand',
    'cost',
    'image_url',
    'manufacturer_id',
    'manufacturer_name',
    'category',
    'subcategory',
    'description',
    'material',
    'powder',
    'thickness',
    'sizes',
    'color',
    'grade',
    'useCase',
    'certifications',
    'texture',
    'cuffStyle',
    'sterility',
    'pack_qty',
    'case_qty',
    'bulk_price',
    'in_stock',
    'featured',
    'industry'
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

/** Normalize brand for consistent filtering: trim, collapse whitespace, strip ®™, optional canonical case. */
function normalizeBrand(value) {
    if (value == null || typeof value !== 'string') return '';
    let s = value.replace(/\s+/g, ' ').trim();
    s = s.replace(/\u00AE|\u2122/g, '').trim(); // ® ™
    if (!s) return '';
    const lower = s.toLowerCase();
    if (lower === 'hospeco') return 'Hospeco';
    if (lower === 'global glove') return 'Global Glove';
    if (lower === 'mcr safety') return 'MCR Safety';
    if (lower === 'safety zone') return 'Safety Zone';
    if (lower === 'wells lamont') return 'Wells Lamont';
    if (lower === 'growl gloves') return 'Growl Gloves';
    if (lower === 'semper guard') return 'Semper Guard';
    return s;
}

/**
 * Map one CSV row to a minimal product for Supabase (sku, name, brand, cost, image_url).
 * Only sku and name are required. image_url missing does NOT block import.
 * Returns null only if sku or name is missing.
 */
function rowToProductForSupabase(values, getVal, col, headers, options = {}) {
    const { headerCount } = options;
    const len = values.length;
    const sku = (getVal(values, 'sku', SKU_ALTERNATES, '') || '').trim();
    if (!sku) return null;
    const name = (getVal(values, 'name', NAME_ALTERNATES, '') || '').trim();
    if (!name) return null;
    const brand = normalizeBrand(getVal(values, 'brand', BRAND_ALTERNATES)) || '';
    const priceVal = getVal(values, 'price', ['unit price', 'unit_price', 'list price', 'list_price', 'unit cost', 'msrp', 'cost'], '0');
    const cost = parseFloat(priceVal) || 0;
    let imageUrl = getVal(values, 'image_url', IMAGE_ALTERNATES, '').trim();
    if (!imageUrl && col('image_url', IMAGE_ALTERNATES) >= 0 && headerCount != null && len > headerCount) {
        const iImage = col('image_url', IMAGE_ALTERNATES);
        imageUrl = values.slice(iImage, len).map(v => (v || '').trim()).filter(Boolean).join(',').trim();
    }
    if (imageUrl && !/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith('/')) imageUrl = '/' + imageUrl;
    return { sku, name, brand, cost, image_url: imageUrl || null };
}

/**
 * Map one CSV row to a product object. Returns null if required fields (sku, name, brand, material, price) are missing.
 * image_url is optional and does not block import.
 */
function rowToProduct(values, getVal, col, headers, options = {}) {
    const { headerCount } = options;
    const len = values.length;
    const sku = (getVal(values, 'sku', SKU_ALTERNATES, '') || '').trim();
    if (!sku) return null;

    const name = getVal(values, 'name', NAME_ALTERNATES);
    const brand = normalizeBrand(getVal(values, 'brand', BRAND_ALTERNATES));
    const material = getVal(values, 'material', ['materials', 'material type']);
    const price = parseFloat(getVal(values, 'price', ['unit price', 'unit_price', 'list price', 'list_price', 'unit cost', 'msrp', 'cost'], '0')) || 0;
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
 * Build CSV string and suggested filename from product list.
 * Round-trip safe: headers match importer mapping; no internal id; manufacturer_name joined from manufacturers.
 * @param {array} products - Array of product objects
 * @param {object} options - { manufacturers: array of { id, name } } for manufacturer_name column
 * @returns {{ csvContent: string, filename: string }}
 */
function productsToCsv(products, options = {}) {
    const list = Array.isArray(products) ? products : [];
    const manufacturers = Array.isArray(options.manufacturers) ? options.manufacturers : [];
    const mfrById = new Map(manufacturers.map(m => [m.id, m.name || '']));

    const escapeCsv = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
        return s;
    };

    const row = (p) => {
        const cost = p.cost != null && p.cost !== '' ? Number(p.cost) : (p.price != null ? Number(p.price) : 0);
        const manufacturerName = (p.manufacturer_id != null && mfrById.has(p.manufacturer_id)) ? mfrById.get(p.manufacturer_id) : '';
        return [
            escapeCsv(p.sku || ''),
            escapeCsv(p.name || ''),
            escapeCsv(p.brand || ''),
            cost,
            escapeCsv(p.image_url || ''),
            p.manufacturer_id != null && p.manufacturer_id !== '' ? p.manufacturer_id : '',
            escapeCsv(manufacturerName),
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
            p.bulk_price ?? 0,
            p.in_stock ? 1 : 0,
            p.featured ? 1 : 0,
            escapeCsv(p.industry || '')
        ];
    };

    const csvRows = [EXPORT_HEADERS.join(',')].concat(list.map(p => row(p).join(',')));
    const csvContent = csvRows.join('\n');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `glovecubs-products-export-${dateStr}.csv`;
    return { csvContent, filename };
}

module.exports = {
    EXPORT_HEADERS,
    parseCSVLine,
    detectDelimiter,
    buildHeaderLookup,
    rowToProduct,
    rowToProductForSupabase,
    productsToCsv
};
