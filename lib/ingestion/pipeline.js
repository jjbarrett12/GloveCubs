/**
 * Product ingestion pipeline orchestrator.
 * Handles CSV parsing, attribute extraction, AI enrichment, validation.
 */

const {
  createEmptyProduct,
  normalizeBrand,
  inferIndustries,
  inferCategory,
  generateSlug,
  generateInternalSku,
} = require('./schema');

const { extractAllAttributes } = require('./extractor');
const { enrichProduct, isConfigured } = require('./enricher');
const { validateAndScore, validateBatch } = require('./validator');

const SKU_COLUMNS = ['sku', 'product_sku', 'item_number', 'part_number', 'part number', 'product code', 'item code', 'item_no'];
const NAME_COLUMNS = ['name', 'product name', 'product_name', 'title', 'product', 'item name', 'description', 'item_description'];
const BRAND_COLUMNS = ['brand', 'manufacturer', 'maker', 'vendor', 'supplier', 'brand name', 'mfr'];
const PRICE_COLUMNS = ['price', 'unit price', 'unit_price', 'cost', 'supplier_cost', 'list price', 'wholesale'];
const IMAGE_COLUMNS = ['image', 'image_url', 'imageurl', 'url', 'photo', 'picture', 'primary_image'];

function detectDelimiter(line) {
  const tabCount = (line.match(/\t/g) || []).length;
  const commaCount = (line.match(/,/g) || []).length;
  const semicolonCount = (line.match(/;/g) || []).length;
  
  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  if (semicolonCount > commaCount) return ';';
  return ',';
}

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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

function buildHeaderLookup(headers) {
  const normalized = headers.map((h, i) => ({
    original: h,
    normalized: (h || '').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''),
    index: i,
  }));
  
  const lookup = {};
  for (const h of normalized) {
    lookup[h.normalized] = h.index;
    lookup[h.original.toLowerCase()] = h.index;
  }
  
  function getColumn(name, alternates = []) {
    const names = [name, ...alternates].map(n => n.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_'));
    for (const n of names) {
      if (lookup[n] !== undefined) return lookup[n];
    }
    for (const n of [name, ...alternates]) {
      const lower = n.toLowerCase();
      if (lookup[lower] !== undefined) return lookup[lower];
    }
    return -1;
  }
  
  function getValue(row, name, alternates = [], defaultVal = null) {
    const idx = getColumn(name, alternates);
    if (idx >= 0 && idx < row.length) {
      const val = row[idx];
      if (val != null && val !== '') return val;
    }
    return defaultVal;
  }
  
  return { lookup, getColumn, getValue, headers: normalized };
}

function parseCSV(csvContent) {
  let content = csvContent;
  if (content && content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) {
    return { headers: [], rows: [], error: 'CSV must have header and at least one data row' };
  }
  
  const delimiter = detectDelimiter(lines[0]);
  const headerRow = parseCSVLine(lines[0], delimiter);
  const { getValue, headers } = buildHeaderLookup(headerRow);
  
  const rows = [];
  const errors = [];
  
  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const values = parseCSVLine(lines[i], delimiter);
    
    if (values.length < 2 || values.every(v => !v.trim())) {
      continue;
    }
    
    const rowObj = {};
    for (const h of headers) {
      const val = values[h.index];
      if (val != null && val !== '') {
        rowObj[h.normalized] = val;
        rowObj[h.original] = val;
      }
    }
    
    rowObj._lineNumber = lineNum;
    rowObj._raw = values;
    rows.push(rowObj);
  }
  
  return { headers: headerRow, rows, delimiter, errors };
}

function transformRow(row, headerLookup) {
  const product = createEmptyProduct();
  
  product._raw = row;
  
  const sku = findValue(row, SKU_COLUMNS);
  const name = findValue(row, NAME_COLUMNS);
  const brand = findValue(row, BRAND_COLUMNS);
  const price = findValue(row, PRICE_COLUMNS);
  const image = findValue(row, IMAGE_COLUMNS);
  
  if (!sku) {
    return { product: null, error: 'Missing SKU' };
  }
  
  product.supplier_sku = String(sku).trim();
  product.internal_sku = generateInternalSku(product.supplier_sku);
  product.brand = normalizeBrand(brand);
  
  const attributes = extractAllAttributes(row);
  
  product.material = attributes.material.value;
  product._confidence = product._confidence || {};
  product._confidence.material = attributes.material;
  
  product.thickness_mil = attributes.thickness_mil.value;
  product._confidence.thickness_mil = attributes.thickness_mil;
  
  product.color = attributes.color.value;
  product._confidence.color = attributes.color;
  
  product.powder = attributes.powder.value;
  product._confidence.powder = attributes.powder;
  
  product.sterility = attributes.sterility.value;
  product._confidence.sterility = attributes.sterility;
  
  product.grade = attributes.grade.value;
  product._confidence.grade = attributes.grade;
  
  product.size_range = attributes.size_range.value;
  product._confidence.size_range = attributes.size_range;
  
  product.pack_qty = attributes.pack_qty.value;
  product._confidence.pack_qty = attributes.pack_qty;
  
  product.case_qty = attributes.case_qty.value;
  product._confidence.case_qty = attributes.case_qty;
  
  product.texture = attributes.texture.value;
  product._confidence.texture = attributes.texture;
  
  product.cuff_style = attributes.cuff_style.value;
  product._confidence.cuff_style = attributes.cuff_style;
  
  product.compliance = attributes.compliance.value;
  product._confidence.compliance = attributes.compliance;
  
  if (product.pack_qty && product.case_qty) {
    product.boxes_per_case = Math.round(product.case_qty / product.pack_qty);
  }
  
  if (price) {
    const parsed = parseFloat(String(price).replace(/[$,]/g, ''));
    if (!isNaN(parsed) && parsed >= 0) {
      product.supplier_cost = parsed;
    }
  }
  
  if (image) {
    let url = String(image).trim();
    if (url && !/^https?:\/\//i.test(url) && !url.startsWith('/')) {
      url = '/' + url;
    }
    product.primary_image = url;
    product.images = [url];
  }
  
  product.canonical_title = name ? String(name).trim() : null;
  
  const titleText = product.canonical_title || '';
  const descText = row.description || '';
  
  product.category = inferCategory(product.material, null, titleText + ' ' + descText);
  product.industries = inferIndustries(titleText + ' ' + descText, product.grade, product.material);
  
  product.seo_slug = generateSlug(
    product.brand,
    product.material,
    product.color,
    product.thickness_mil,
    product.supplier_sku
  );
  
  return { product, error: null };
}

function findValue(row, candidates) {
  for (const key of candidates) {
    const lower = key.toLowerCase();
    const normalized = lower.replace(/[^a-z0-9]/g, '_');
    
    if (row[key] != null && row[key] !== '') return row[key];
    if (row[lower] != null && row[lower] !== '') return row[lower];
    if (row[normalized] != null && row[normalized] !== '') return row[normalized];
    
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase() === lower || rk.toLowerCase().replace(/[^a-z0-9]/g, '_') === normalized) {
        if (row[rk] != null && row[rk] !== '') return row[rk];
      }
    }
  }
  return null;
}

async function processCSV(csvContent, options = {}) {
  const { enableAI = true, onProgress = null } = options;
  
  const parsed = parseCSV(csvContent);
  if (parsed.error) {
    return { success: false, error: parsed.error, products: [], validation: null };
  }
  
  const products = [];
  const transformErrors = [];
  
  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const { product, error } = transformRow(row);
    
    if (error) {
      transformErrors.push({ line: row._lineNumber, error });
      continue;
    }
    
    products.push(product);
    
    if (onProgress) {
      onProgress({ stage: 'transform', current: i + 1, total: parsed.rows.length });
    }
  }
  
  const enrichedProducts = [];
  for (let i = 0; i < products.length; i++) {
    let product = products[i];
    
    if (enableAI && isConfigured()) {
      product = await enrichProduct(product);
    } else {
      const { enrichProduct: enrich } = require('./enricher');
      product = await enrich(product);
    }
    
    enrichedProducts.push(product);
    
    if (onProgress) {
      onProgress({ stage: 'enrich', current: i + 1, total: products.length });
    }
  }
  
  const validation = validateBatch(enrichedProducts);
  
  return {
    success: true,
    products: enrichedProducts,
    validation,
    transformErrors,
    stats: {
      totalRows: parsed.rows.length,
      successfulTransforms: products.length,
      failedTransforms: transformErrors.length,
      readyForImport: validation.summary.pending,
      needsReview: validation.summary.reviewRequired,
      avgConfidence: validation.summary.avgConfidence,
    },
  };
}

function toSupabaseRaw(product, batchId, supplierId) {
  return {
    batch_id: batchId,
    supplier_id: supplierId,
    external_id: product.supplier_sku,
    raw_payload: product._raw,
    checksum: computeChecksum(product._raw),
  };
}

function toSupabaseNormalized(product, batchId, rawId, supplierId) {
  return {
    batch_id: batchId,
    raw_id: rawId,
    supplier_id: supplierId,
    normalized_data: {
      canonical_title: product.canonical_title,
      brand: product.brand,
      short_description: product.short_description,
      long_description: product.long_description,
      bullet_features: product.bullet_features,
      search_keywords: product.search_keywords,
      seo_slug: product.seo_slug,
      supplier_cost: product.supplier_cost,
      internal_sku: product.internal_sku,
      images: product.images,
      primary_image: product.primary_image,
      pack_qty: product.pack_qty,
      case_qty: product.case_qty,
      boxes_per_case: product.boxes_per_case,
    },
    attributes: {
      material: product.material,
      thickness_mil: product.thickness_mil,
      color: product.color,
      powder: product.powder,
      sterility: product.sterility,
      grade: product.grade,
      size_range: product.size_range,
      texture: product.texture,
      cuff_style: product.cuff_style,
      compliance: product.compliance,
      industries: product.industries,
      category: product.category,
      subcategory: product.subcategory,
    },
    match_confidence: product._validation?.overallConfidence || 0,
    status: product._validation?.status || 'pending',
  };
}

function computeChecksum(data) {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function exportForReview(products) {
  return products.map((p, i) => ({
    index: i,
    supplier_sku: p.supplier_sku,
    internal_sku: p.internal_sku,
    canonical_title: p.canonical_title,
    brand: p.brand,
    material: p.material,
    color: p.color,
    thickness_mil: p.thickness_mil,
    powder: p.powder,
    grade: p.grade,
    pack_qty: p.pack_qty,
    case_qty: p.case_qty,
    supplier_cost: p.supplier_cost,
    category: p.category,
    subcategory: p.subcategory,
    primary_image: p.primary_image,
    confidence: p._validation?.overallConfidence?.toFixed(2) || 'N/A',
    status: p._validation?.status || 'unknown',
    flags: (p._flags || []).map(f => `${f.severity}: ${f.message}`).join('; '),
  }));
}

module.exports = {
  parseCSV,
  parseCSVLine,
  buildHeaderLookup,
  detectDelimiter,
  transformRow,
  processCSV,
  toSupabaseRaw,
  toSupabaseNormalized,
  exportForReview,
  computeChecksum,
};
