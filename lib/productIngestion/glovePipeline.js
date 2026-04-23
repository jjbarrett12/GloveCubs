/**
 * Glove product ingestion pipeline.
 * Normalizes supplier CSV rows into internal product schema.
 * Output: rows ready for products table insertion.
 */

const productStore = require('../product-store');

// ----- Helpers -----

function cleanTitle(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\u00AE|\u2122|®|™/g, '')
    .trim();
}

function extractMaterial(text, columnValue) {
  const combined = [columnValue, text].filter(Boolean).join(' ').toLowerCase();
  const map = [
    { pattern: /\bnitrile\b/, value: 'Nitrile' },
    { pattern: /\blatex\b/, value: 'Latex' },
    { pattern: /\bvinyl\b|\bpvc\b/, value: 'Vinyl' },
    { pattern: /\bpolyethylene\b|poly\s*ethylene\b|\bpe\s*glove\b/, value: 'Polyethylene' },
    { pattern: /\bnylon\s*[\/\s]?\s*nitrile\b|nitrile\s*[\/\s]?\s*nylon\b/, value: 'Nylon/Nitrile' },
    { pattern: /\bhppe\s*[\/\s]?\s*nitrile\b|nitrile\s*[\/\s]?\s*hppe\b/, value: 'HPPE/Nitrile' },
    { pattern: /\bhppe\s*[\/\s]?\s*steel\b/, value: 'HPPE/Steel' },
    { pattern: /\bdyneema\b|engineered\s*yarn\b/, value: 'Engineered Yarn/Nitrile' },
    { pattern: /\bnylon\s*[\/\s]?\s*tpr\b|tpr\b/, value: 'Nylon/TPR' },
    { pattern: /\bcowhide\b|leather\b/, value: 'Cowhide Leather' },
  ];
  for (const { pattern, value } of map) {
    if (pattern.test(combined)) return value;
  }
  return columnValue ? String(columnValue).trim() : null;
}

function extractThickness(text, columnValue, description) {
  const combined = [columnValue, text, description].filter(Boolean).join(' ').toLowerCase();
  const milMatch = combined.match(/(\d+(?:\.\d+)?)\s*[-]?\s*(?:mil|mm)\b/i) ||
    combined.match(/\b(\d+(?:\.\d+)?)\s*(?:mil|mm)?/i);
  if (milMatch) {
    const num = parseFloat(milMatch[1]);
    if (Number.isFinite(num) && num >= 1 && num <= 30) return String(num);
  }
  if (columnValue) {
    const n = parseFloat(String(columnValue));
    if (Number.isFinite(n) && n >= 1) return String(n);
  }
  return null;
}

function extractPowder(text, columnValue, description) {
  const combined = [columnValue, text, description].filter(Boolean).join(' ').toLowerCase();
  if (/\bpowder[- ]?free\b|powderfree\b|pf\b(?!\s*glove)/.test(combined)) return 'Powder-Free';
  if (/\bpowdered\b/.test(combined)) return 'Powdered';
  const col = (columnValue || '').toString().toLowerCase();
  if (['powder-free', 'powder free', 'pf'].some((s) => col.includes(s))) return 'Powder-Free';
  if (col.includes('powdered')) return 'Powdered';
  return null;
}

function extractColor(text, columnValue, description) {
  const combined = [columnValue, text, (description || '').slice(0, 300)].filter(Boolean).join(' ').toLowerCase();
  const map = [
    'blue', 'black', 'white', 'purple', 'orange', 'green', 'tan', 'gray', 'grey', 'brown',
    'pink', 'yellow', 'navy', 'red', 'natural', 'clear', 'silver'
  ];
  for (const c of map) {
    if (combined.includes(c)) {
      if (c === 'grey') return 'Gray';
      if (c === 'natural') return 'Natural';
      if (c === 'clear') return 'Clear';
      return c.charAt(0).toUpperCase() + c.slice(1);
    }
  }
  if (columnValue) return String(columnValue).trim();
  return null;
}

function extractSizes(text, columnValue) {
  const combined = columnValue || '';
  const parts = String(combined).split(/[\s,;\/]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (parts.length) return parts.join(', ');
  const sizeMatch = text.match(/\b(xs|s|m|l|xl|xxl|2xl|3xl)\b/gi);
  if (sizeMatch) return [...new Set(sizeMatch.map((x) => x.toUpperCase()))].join(', ');
  return null;
}

function extractPackQty(text, columnValue) {
  const combined = [columnValue, text].filter(Boolean).join(' ');
  const n = parseInt(columnValue, 10);
  if (Number.isFinite(n) && n > 0) return n;
  const m = combined.match(/(\d+)\s*[\/]?\s*(?:per\s*)?(?:box|bx|pk|pack)\b/i) ||
    combined.match(/\b(?:box|bx)\s*of\s*(\d+)\b/i);
  if (m) return parseInt(m[1], 10);
  const m100 = combined.match(/100\s*[\/]\s*bx/i);
  if (m100) return 100;
  return 100;
}

function extractCaseQty(text, columnValue) {
  const combined = [columnValue, text].filter(Boolean).join(' ');
  const n = parseInt(columnValue, 10);
  if (Number.isFinite(n) && n > 0) return n;
  const m = combined.match(/(\d+)\s*[\/]?\s*(?:per\s*)?(?:case|cs)\b/i) ||
    combined.match(/\b(?:case|cs)\s*of\s*(\d+)\b/i) ||
    combined.match(/(\d+)\s*bx\s*[\/]\s*cs/i);
  if (m) return parseInt(m[1], 10);
  const m1000 = combined.match(/1000\s*[\/]?\s*case|10\s*bx\s*[\/]\s*cs/i);
  if (m1000) return 1000;
  return 1000;
}

function mapCategory(material, subcategory, text) {
  const t = (text || '').toLowerCase();
  const mat = (material || '').toLowerCase();
  const sub = (subcategory || '').toLowerCase();
  if (/\bwork\s*glove\b|cut\s*resistant|coated|impact|leather|reusable\b/.test(t + ' ' + sub)) {
    return 'Work Gloves';
  }
  if (/\bdisposable\b|exam\s*glove|nitrile\b|latex\b|vinyl\b/.test(t + ' ' + mat)) {
    return 'Disposable Gloves';
  }
  return 'Disposable Gloves';
}

function mapSubcategory(material, category, text) {
  const t = (text || '').toLowerCase();
  const mat = (material || '').toLowerCase();
  if (/\bcut\s*resistant\b|ansi\s*a[0-9]\b/.test(t)) return 'Cut Resistant';
  if (/\bcoated\b|foam\s*nitrile|nitrile\s*coated/.test(t)) return 'Coated';
  if (/\bimpact\b|tpr\b/.test(t)) return 'Impact Resistant';
  if (/\bleather\b|cowhide\b/.test(t)) return 'Leather';
  if (mat.includes('nitrile')) return 'Nitrile';
  if (mat.includes('latex')) return 'Latex';
  if (mat.includes('vinyl')) return 'Vinyl';
  return material || 'General';
}

function generateSeoName(brand, material, color, thickness, powder, grade) {
  const parts = [];
  if (brand) parts.push(brand);
  if (material) parts.push(material);
  if (grade && grade !== 'General') parts.push(grade);
  if (thickness) parts.push(`${thickness} Mil`);
  if (color) parts.push(color);
  if (powder) parts.push(powder);
  if (parts.length < 2) return null;
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function generateSlug(sku, name) {
  const base = (name || sku || 'product').toString()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const skuClean = (sku || '').toString().replace(/[^a-z0-9-]/gi, '').toLowerCase();
  if (skuClean && base) return `${base}-${skuClean}`;
  return base || skuClean || `product-${Date.now()}`;
}

function generateDescription(material, color, powder, thickness, grade, packQty, caseQty) {
  const parts = [];
  if (material) parts.push(`High-quality ${material.toLowerCase()} gloves`);
  if (color) parts.push(`available in ${color.toLowerCase()}`);
  if (powder) parts.push(`(${powder.toLowerCase()})`);
  if (thickness) parts.push(`with ${thickness} mil thickness`);
  if (grade) parts.push(`for ${grade.toLowerCase().replace(/\s*\/\s*/g, ' and ')} applications`);
  parts.push('.');
  if (packQty && caseQty) parts.push(`${packQty} per box, ${caseQty} per case.`);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function normalizeBrand(value) {
  if (value == null || typeof value !== 'string') return '';
  let s = value.replace(/\s+/g, ' ').replace(/\u00AE|\u2122|®|™/g, '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  const canon = { hospeco: 'Hospeco', 'global glove': 'Global Glove', 'mcr safety': 'MCR Safety', 'wells lamont': 'Wells Lamont', safeko: 'Safeko', ambitex: 'Ambitex', ansell: 'Ansell', showa: 'SHOWA', pip: 'PIP' };
  return canon[lower] || s;
}

// ----- Pipeline -----

const SKU_ALTERNATES = ['product_sku', 'item_number', 'part_number', 'part number', 'product code', 'item code'];
const NAME_ALTERNATES = ['product name', 'product_name', 'title', 'product', 'item name'];
const BRAND_ALTERNATES = ['manufacturer', 'maker', 'vendor', 'supplier', 'brand name', 'mfr'];
const IMAGE_ALTERNATES = ['image url', 'image', 'imageurl', 'url', 'photo', 'picture'];

/**
 * Process one CSV row into a product for the products table.
 * @param {string[]} values - Row values
 * @param {function} getVal - (values, name, alternates, default) => value
 * @returns {object|null} Product row for insertion, or null if SKU/name missing
 */
function processRow(values, getVal) {
  const rawSku = (getVal(values, 'sku', SKU_ALTERNATES, '') || '').trim();
  const rawName = (getVal(values, 'name', NAME_ALTERNATES, '') || '').trim();
  if (!rawSku || !rawName) return null;

  const sku = rawSku;
  const rawTitle = cleanTitle(rawName);
  const rawBrand = getVal(values, 'brand', BRAND_ALTERNATES, '');
  const rawMaterial = getVal(values, 'material', ['materials', 'material type'], '');
  const rawThickness = getVal(values, 'thickness', ['thickness (mil)', 'mil'], '');
  const rawPowder = getVal(values, 'powder', ['powdered', 'powder free'], '');
  const rawColor = getVal(values, 'color', ['colour', 'colors'], '');
  const rawSizes = getVal(values, 'sizes', ['size', 'sizing', 'size_options'], '');
  const rawPackQty = getVal(values, 'pack_qty', ['pack qty', 'packqty', 'box_qty', 'per box'], '');
  const rawCaseQty = getVal(values, 'case_qty', ['case qty', 'caseqty', 'case size'], '');
  const rawCategory = getVal(values, 'category', ['product category', 'type'], '');
  const rawSubcategory = getVal(values, 'subcategory', ['sub_category'], '');
  const rawDescription = getVal(values, 'description', ['product description', 'desc'], '');
  const rawGrade = getVal(values, 'grade', ['grade type'], '');
  const rawUseCase = getVal(values, 'useCase', ['use case', 'industry'], '');

  const material = extractMaterial(rawTitle, rawMaterial, rawDescription) || rawMaterial;
  const thickness = extractThickness(rawTitle, rawThickness, rawDescription);
  const powder = extractPowder(rawTitle, rawPowder, rawDescription);
  const color = extractColor(rawTitle, rawColor, rawDescription);
  const sizes = extractSizes(rawTitle, rawSizes);
  const pack_qty = extractPackQty(rawTitle, rawPackQty);
  const case_qty = extractCaseQty(rawTitle, rawCaseQty);

  const category = rawCategory ? String(rawCategory).trim() : mapCategory(material, rawSubcategory, rawTitle);
  const subcategory = rawSubcategory ? String(rawSubcategory).trim() : mapSubcategory(material, category, rawTitle);

  const brand = normalizeBrand(rawBrand) || null;

  const seoName = generateSeoName(brand, material, color, thickness, powder, rawGrade);
  const name = seoName || rawTitle;

  const slug = generateSlug(sku, name);

  const description = rawDescription
    ? String(rawDescription).trim()
    : generateDescription(material, color, powder, thickness, rawGrade || null, pack_qty, case_qty);

  const priceVal = getVal(values, 'price', ['unit price', 'unit_price', 'list price', 'cost', 'msrp'], '0');
  const bulkVal = getVal(values, 'bulk_price', ['bulk price', 'wholesale'], '0');
  const costVal = getVal(values, 'cost', ['unit cost'], priceVal);
  const price = parseFloat(priceVal) || 0;
  const bulk_price = parseFloat(bulkVal) || 0;
  const cost = parseFloat(costVal) || price;

  let image_url = getVal(values, 'image_url', IMAGE_ALTERNATES, '').trim();
  if (image_url && !/^https?:\/\//i.test(image_url) && !image_url.startsWith('/')) {
    image_url = '/' + image_url;
  }
  if (!image_url) image_url = null;

  const inStockVal = getVal(values, 'in_stock', ['stock', 'available', 'availability'], '1');
  const in_stock = ['1', 'true', 'yes'].includes(String(inStockVal).toLowerCase()) ? 1 : 0;
  const featuredVal = getVal(values, 'featured', ['feature'], '0');
  const featured = ['1', 'true', 'yes'].includes(String(featuredVal).toLowerCase()) ? 1 : 0;

  return {
    sku,
    name,
    brand,
    category,
    subcategory,
    description,
    material,
    powder: powder || null,
    thickness: thickness || null,
    sizes: sizes || null,
    color: color || null,
    grade: rawGrade ? String(rawGrade).trim() : null,
    use_case: rawUseCase ? String(rawUseCase).trim() : null,
    pack_qty,
    case_qty,
    cost,
    price,
    bulk_price,
    image_url,
    in_stock,
    featured,
    slug,
  };
}

/**
 * Process CSV content into product rows.
 * @param {string} csvContent - Raw CSV
 * @returns {{ rows: object[], errors: Array<{ row: number, message: string }> }}
 */
function processCsv(csvContent) {
  const result = { rows: [], errors: [] };
  let content = csvContent;
  if (content && content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  const lines = (content || '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    result.errors.push({ row: 0, message: 'CSV must have header and at least one data row.' });
    return result;
  }

  const delimiter = productStore.detectDelimiter(lines[0]);
  const parseLine = (line) =>
    productStore.parseCSVLine(line, delimiter).map((v) => (v || '').replace(/^"|"$/g, '').trim());
  const headers = parseLine(lines[0]).map((h) => (h || '').replace(/^\ufeff/, '').trim());
  const { getVal, col } = productStore.buildHeaderLookup(headers);
  const headerCount = headers.length;

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const values = parseLine(lines[i]);
    if (values.length < Math.min(2, headerCount)) continue;
    if (values.every((v) => !(v || '').trim())) continue;

    try {
      const row = processRow(values, getVal);
      if (row) {
        result.rows.push(row);
      } else {
        result.errors.push({ row: lineNum, message: 'Missing SKU or name' });
      }
    } catch (err) {
      result.errors.push({ row: lineNum, message: (err && err.message) || String(err) });
    }
  }

  return result;
}

module.exports = {
  processRow,
  processCsv,
  cleanTitle,
  extractMaterial,
  extractThickness,
  extractPowder,
  extractColor,
  extractSizes,
  extractPackQty,
  extractCaseQty,
  mapCategory,
  mapSubcategory,
  generateSeoName,
  generateSlug,
  generateDescription,
};
