/**
 * Product Extraction Service
 * 
 * Extracts product attributes from HTML pages:
 * - Item number / SKU / MPN
 * - Title and description
 * - Spec table parsing
 * - Material, size, thickness, color
 * - Pack size and units
 * 
 * Uses both structural extraction (JSON-LD, meta tags, tables)
 * and heuristic extraction (pattern matching).
 */

import {
  extractTextContent,
  extractMetaTags,
  extractTitle,
  extractTables,
  extractJsonLd,
} from './urlFetch';

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedProductData {
  // Identifiers
  item_number?: string;
  sku?: string;
  mpn?: string;
  upc?: string;
  
  // Core info
  title?: string;
  description?: string;
  brand?: string;
  manufacturer?: string;
  
  // Product attributes
  material?: string;
  size?: string;
  sizes_available?: string[];
  color?: string;
  colors_available?: string[];
  thickness_mil?: number;
  
  // Pack info
  pack_size?: number;
  units_per_box?: number;
  boxes_per_case?: number;
  total_units_per_case?: number;
  
  // Product flags
  powder_free?: boolean;
  latex_free?: boolean;
  sterile?: boolean;
  exam_grade?: boolean;
  food_safe?: boolean;
  
  // Price (if available)
  price?: number;
  price_per_unit?: number;
  
  // Raw extracted data
  spec_table?: Record<string, string>;
  all_attributes?: Record<string, unknown>;
}

export interface ExtractionResult {
  success: boolean;
  extracted: ExtractedProductData;
  confidence: {
    overall: number;
    field_scores: Record<string, number>;
  };
  reasoning: {
    summary: string;
    sources: string[];
    warnings: string[];
  };
  raw_data: {
    json_ld?: Record<string, unknown>[];
    meta_tags?: Record<string, string>;
    spec_tables?: Array<{ headers: string[]; rows: string[][] }>;
  };
}

// ============================================================================
// EXTRACTION PATTERNS
// ============================================================================

const MATERIAL_PATTERNS: Record<string, RegExp[]> = {
  nitrile: [/nitrile/i, /nit\b/i],
  latex: [/latex/i, /natural\s*rubber/i],
  vinyl: [/vinyl/i, /pvc/i],
  neoprene: [/neoprene/i, /chloroprene/i],
  poly: [/polyethylene/i, /poly\s*glove/i, /\bpe\b/i],
  blend: [/blend/i, /hybrid/i],
};

const SIZE_PATTERNS: Record<string, RegExp[]> = {
  XS: [/\bxs\b/i, /\bx-small\b/i, /\bextra\s*small\b/i],
  S: [/\bsmall\b/i, /\bs\b(?!pecial|terile)/i],
  M: [/\bmedium\b/i, /\bmed\b/i],
  L: [/\blarge\b/i, /\blg\b/i],
  XL: [/\bx-?large\b/i, /\bxl\b/i, /\bextra\s*large\b/i],
  XXL: [/\bxxl\b/i, /\b2xl\b/i, /\bxx-?large\b/i],
};

const COLOR_PATTERNS: Record<string, RegExp[]> = {
  blue: [/\bblue\b/i],
  black: [/\bblack\b/i],
  white: [/\bwhite\b/i],
  purple: [/\bpurple\b/i, /\bviolet\b/i],
  green: [/\bgreen\b/i],
  orange: [/\borange\b/i],
  pink: [/\bpink\b/i],
  clear: [/\bclear\b/i, /\btransparent\b/i],
};

const SPEC_TABLE_KEYS: Record<string, string[]> = {
  item_number: ['item', 'item number', 'item #', 'item no', 'product code', 'part number', 'part #', 'catalog'],
  sku: ['sku', 'stock keeping unit', 'stock number'],
  mpn: ['mpn', 'mfg part', 'manufacturer part', 'mfr part', 'mfg #', 'model'],
  upc: ['upc', 'gtin', 'ean', 'barcode'],
  brand: ['brand', 'brand name'],
  manufacturer: ['manufacturer', 'mfg', 'made by', 'mfr'],
  material: ['material', 'composition', 'glove material', 'type'],
  size: ['size', 'glove size'],
  color: ['color', 'colour'],
  thickness: ['thickness', 'mil', 'gauge'],
  pack_size: ['pack size', 'quantity', 'count', 'units', 'gloves per box', 'per box', 'box qty'],
  units_per_case: ['per case', 'case qty', 'case quantity', 'units per case'],
  powder_free: ['powder', 'powder free', 'powder-free'],
  latex_free: ['latex free', 'latex-free'],
  sterile: ['sterile', 'sterility'],
  exam_grade: ['exam', 'examination', 'medical'],
  food_safe: ['food', 'food safe', 'food grade', 'food service'],
};

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract product data from HTML content.
 */
export function extractProductFromHtml(html: string, sourceUrl?: string): ExtractionResult {
  const sources: string[] = [];
  const warnings: string[] = [];
  const field_scores: Record<string, number> = {};
  
  // Initialize extracted data
  const extracted: ExtractedProductData = {};
  const raw_data: ExtractionResult['raw_data'] = {};
  
  // =========================================================================
  // 1. Extract JSON-LD structured data (highest priority)
  // =========================================================================
  const jsonLd = extractJsonLd(html);
  raw_data.json_ld = jsonLd;
  
  if (jsonLd.length > 0) {
    sources.push('JSON-LD');
    extractFromJsonLd(jsonLd, extracted, field_scores);
  }
  
  // =========================================================================
  // 2. Extract meta tags
  // =========================================================================
  const metaTags = extractMetaTags(html);
  raw_data.meta_tags = metaTags;
  
  if (Object.keys(metaTags).length > 0) {
    sources.push('meta tags');
    extractFromMetaTags(metaTags, extracted, field_scores);
  }
  
  // =========================================================================
  // 3. Extract from tables (spec tables)
  // =========================================================================
  const tables = extractTables(html);
  raw_data.spec_tables = tables;
  
  if (tables.length > 0) {
    sources.push('spec tables');
    const specTable = extractFromTables(tables, extracted, field_scores);
    if (specTable) {
      extracted.spec_table = specTable;
    }
  }
  
  // =========================================================================
  // 4. Extract title
  // =========================================================================
  const pageTitle = extractTitle(html);
  if (pageTitle && !extracted.title) {
    extracted.title = cleanTitle(pageTitle);
    field_scores.title = 0.8;
    sources.push('page title');
  }
  
  // =========================================================================
  // 5. Heuristic extraction from text content
  // =========================================================================
  const textContent = extractTextContent(html);
  extractFromText(textContent, extracted, field_scores, warnings);
  
  // =========================================================================
  // 6. Normalize and validate extracted data
  // =========================================================================
  normalizeExtractedData(extracted);
  
  // Calculate overall confidence
  const scores = Object.values(field_scores);
  const overallConfidence = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;
  
  // Generate summary
  const extractedFields = Object.keys(extracted).filter(k => 
    extracted[k as keyof ExtractedProductData] !== undefined
  );
  
  const summary = extractedFields.length > 0
    ? `Extracted ${extractedFields.length} fields from ${sources.join(', ')}`
    : 'Failed to extract product data';
  
  return {
    success: extractedFields.length >= 2,
    extracted,
    confidence: {
      overall: overallConfidence,
      field_scores,
    },
    reasoning: {
      summary,
      sources,
      warnings,
    },
    raw_data,
  };
}

// ============================================================================
// JSON-LD EXTRACTION
// ============================================================================

function extractFromJsonLd(
  jsonLd: Record<string, unknown>[],
  extracted: ExtractedProductData,
  scores: Record<string, number>
): void {
  for (const item of jsonLd) {
    const type = String(item['@type'] || '').toLowerCase();
    
    if (type === 'product' || type.includes('product')) {
      // Product schema
      if (item.name && !extracted.title) {
        extracted.title = String(item.name);
        scores.title = 1.0;
      }
      
      if (item.description && !extracted.description) {
        extracted.description = String(item.description);
        scores.description = 1.0;
      }
      
      if (item.sku && !extracted.sku) {
        extracted.sku = String(item.sku);
        scores.sku = 1.0;
      }
      
      if (item.mpn && !extracted.mpn) {
        extracted.mpn = String(item.mpn);
        scores.mpn = 1.0;
      }
      
      if (item.gtin || item.gtin12 || item.gtin13 || item.gtin14) {
        extracted.upc = String(item.gtin || item.gtin12 || item.gtin13 || item.gtin14);
        scores.upc = 1.0;
      }
      
      if (item.brand) {
        const brand = typeof item.brand === 'object' 
          ? (item.brand as Record<string, unknown>).name 
          : item.brand;
        if (brand) {
          extracted.brand = String(brand);
          scores.brand = 1.0;
        }
      }
      
      if (item.manufacturer) {
        const mfr = typeof item.manufacturer === 'object'
          ? (item.manufacturer as Record<string, unknown>).name
          : item.manufacturer;
        if (mfr) {
          extracted.manufacturer = String(mfr);
          scores.manufacturer = 1.0;
        }
      }
      
      // Price
      if (item.offers) {
        const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
        if (offers && typeof offers === 'object') {
          const offersObj = offers as Record<string, unknown>;
          if (offersObj.price) {
            extracted.price = parseFloat(String(offersObj.price));
            scores.price = 0.9;
          }
        }
      }
      
      // Additional properties
      if (item.additionalProperty && Array.isArray(item.additionalProperty)) {
        for (const prop of item.additionalProperty) {
          if (prop && typeof prop === 'object') {
            const propObj = prop as Record<string, unknown>;
            const name = String(propObj.name || '').toLowerCase();
            const value = propObj.value;
            
            if (name.includes('material') && value) {
              extracted.material = String(value);
              scores.material = 0.95;
            }
            if (name.includes('size') && value) {
              extracted.size = String(value);
              scores.size = 0.95;
            }
            if (name.includes('color') && value) {
              extracted.color = String(value);
              scores.color = 0.95;
            }
          }
        }
      }
    }
  }
}

// ============================================================================
// META TAG EXTRACTION
// ============================================================================

function extractFromMetaTags(
  meta: Record<string, string>,
  extracted: ExtractedProductData,
  scores: Record<string, number>
): void {
  // OG tags
  if (meta['og:title'] && !extracted.title) {
    extracted.title = cleanTitle(meta['og:title']);
    scores.title = Math.max(scores.title || 0, 0.85);
  }
  
  if (meta['og:description'] && !extracted.description) {
    extracted.description = meta['og:description'];
    scores.description = Math.max(scores.description || 0, 0.85);
  }
  
  // Product-specific meta tags
  if (meta['product:brand'] && !extracted.brand) {
    extracted.brand = meta['product:brand'];
    scores.brand = 0.9;
  }
  
  if (meta['product:price:amount'] && !extracted.price) {
    extracted.price = parseFloat(meta['product:price:amount']);
    scores.price = 0.85;
  }
  
  // Twitter cards
  if (meta['twitter:title'] && !extracted.title) {
    extracted.title = cleanTitle(meta['twitter:title']);
    scores.title = Math.max(scores.title || 0, 0.8);
  }
}

// ============================================================================
// TABLE EXTRACTION
// ============================================================================

function extractFromTables(
  tables: Array<{ headers: string[]; rows: string[][] }>,
  extracted: ExtractedProductData,
  scores: Record<string, number>
): Record<string, string> | null {
  const specTable: Record<string, string> = {};
  
  for (const table of tables) {
    // Look for key-value pairs in 2-column tables
    if (table.rows.length > 0) {
      for (const row of table.rows) {
        if (row.length >= 2) {
          const key = row[0].toLowerCase().trim();
          const value = row[1].trim();
          
          if (key && value) {
            specTable[key] = value;
            
            // Try to match against known fields
            for (const [field, aliases] of Object.entries(SPEC_TABLE_KEYS)) {
              if (aliases.some(alias => key.includes(alias))) {
                mapSpecValue(field, value, extracted, scores);
              }
            }
          }
        }
      }
    }
  }
  
  return Object.keys(specTable).length > 0 ? specTable : null;
}

function mapSpecValue(
  field: string,
  value: string,
  extracted: ExtractedProductData,
  scores: Record<string, number>
): void {
  switch (field) {
    case 'item_number':
      if (!extracted.item_number) {
        extracted.item_number = value;
        scores.item_number = 0.95;
      }
      break;
    case 'sku':
      if (!extracted.sku) {
        extracted.sku = value;
        scores.sku = 0.95;
      }
      break;
    case 'mpn':
      if (!extracted.mpn) {
        extracted.mpn = value;
        scores.mpn = 0.95;
      }
      break;
    case 'upc':
      if (!extracted.upc) {
        extracted.upc = value.replace(/[^0-9]/g, '');
        scores.upc = 0.95;
      }
      break;
    case 'brand':
      if (!extracted.brand) {
        extracted.brand = value;
        scores.brand = 0.9;
      }
      break;
    case 'manufacturer':
      if (!extracted.manufacturer) {
        extracted.manufacturer = value;
        scores.manufacturer = 0.9;
      }
      break;
    case 'material':
      if (!extracted.material) {
        extracted.material = normalizeMaterial(value);
        scores.material = 0.9;
      }
      break;
    case 'size':
      if (!extracted.size) {
        extracted.size = normalizeSize(value);
        scores.size = 0.9;
      }
      break;
    case 'color':
      if (!extracted.color) {
        extracted.color = value;
        scores.color = 0.9;
      }
      break;
    case 'thickness':
      if (!extracted.thickness_mil) {
        const milMatch = value.match(/(\d+\.?\d*)\s*mil/i);
        if (milMatch) {
          extracted.thickness_mil = parseFloat(milMatch[1]);
          scores.thickness_mil = 0.95;
        }
      }
      break;
    case 'pack_size':
      if (!extracted.pack_size) {
        const numMatch = value.match(/(\d+)/);
        if (numMatch) {
          extracted.pack_size = parseInt(numMatch[1]);
          scores.pack_size = 0.9;
        }
      }
      break;
    case 'units_per_case':
      if (!extracted.total_units_per_case) {
        const numMatch = value.match(/(\d+)/);
        if (numMatch) {
          extracted.total_units_per_case = parseInt(numMatch[1]);
          scores.total_units_per_case = 0.9;
        }
      }
      break;
    case 'powder_free':
      extracted.powder_free = /yes|true|powder.?free/i.test(value);
      scores.powder_free = 0.95;
      break;
    case 'latex_free':
      extracted.latex_free = /yes|true|latex.?free/i.test(value);
      scores.latex_free = 0.95;
      break;
    case 'sterile':
      extracted.sterile = /yes|true|sterile/i.test(value);
      scores.sterile = 0.95;
      break;
    case 'exam_grade':
      extracted.exam_grade = /yes|true|exam|medical/i.test(value);
      scores.exam_grade = 0.9;
      break;
    case 'food_safe':
      extracted.food_safe = /yes|true|food/i.test(value);
      scores.food_safe = 0.9;
      break;
  }
}

// ============================================================================
// TEXT CONTENT EXTRACTION (HEURISTICS)
// ============================================================================

function extractFromText(
  text: string,
  extracted: ExtractedProductData,
  scores: Record<string, number>,
  warnings: string[]
): void {
  // Extract material if not already found
  if (!extracted.material) {
    for (const [material, patterns] of Object.entries(MATERIAL_PATTERNS)) {
      if (patterns.some(p => p.test(text))) {
        extracted.material = material;
        scores.material = 0.7;
        break;
      }
    }
  }
  
  // Extract sizes available
  const sizesFound: string[] = [];
  for (const [size, patterns] of Object.entries(SIZE_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      sizesFound.push(size);
    }
  }
  if (sizesFound.length > 0) {
    extracted.sizes_available = sizesFound;
    if (!extracted.size && sizesFound.length === 1) {
      extracted.size = sizesFound[0];
      scores.size = 0.6;
    } else if (sizesFound.length > 1) {
      warnings.push('Multiple sizes detected - may need to specify');
    }
  }
  
  // Extract colors available
  const colorsFound: string[] = [];
  for (const [color, patterns] of Object.entries(COLOR_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      colorsFound.push(color);
    }
  }
  if (colorsFound.length > 0) {
    extracted.colors_available = colorsFound;
    if (!extracted.color && colorsFound.length === 1) {
      extracted.color = colorsFound[0];
      scores.color = 0.6;
    }
  }
  
  // Extract thickness
  if (!extracted.thickness_mil) {
    const milMatch = text.match(/(\d+\.?\d*)\s*mil\b/i);
    if (milMatch) {
      extracted.thickness_mil = parseFloat(milMatch[1]);
      scores.thickness_mil = 0.7;
    }
  }
  
  // Extract pack size patterns
  if (!extracted.pack_size) {
    const packPatterns = [
      /(\d+)\s*(?:ct|count|pcs|pieces|gloves)\s*(?:per|\/)\s*box/i,
      /(\d+)\s*(?:ct|count|per box)/i,
      /box\s*of\s*(\d+)/i,
    ];
    for (const pattern of packPatterns) {
      const match = text.match(pattern);
      if (match) {
        extracted.pack_size = parseInt(match[1]);
        scores.pack_size = 0.7;
        break;
      }
    }
  }
  
  // Extract case quantity
  if (!extracted.total_units_per_case) {
    const caseMatch = text.match(/(\d+)\s*(?:per case|\/case|gloves per case)/i);
    if (caseMatch) {
      extracted.total_units_per_case = parseInt(caseMatch[1]);
      scores.total_units_per_case = 0.7;
    }
  }
  
  // Detect product flags from text
  if (extracted.powder_free === undefined) {
    extracted.powder_free = /powder.?free/i.test(text);
    if (extracted.powder_free) scores.powder_free = 0.8;
  }
  
  if (extracted.latex_free === undefined) {
    extracted.latex_free = /latex.?free/i.test(text) || extracted.material === 'nitrile' || extracted.material === 'vinyl';
    if (extracted.latex_free) scores.latex_free = extracted.material === 'latex' ? 0 : 0.75;
  }
  
  if (extracted.exam_grade === undefined) {
    extracted.exam_grade = /exam(?:ination)?\s*(?:grade|quality)/i.test(text);
    if (extracted.exam_grade) scores.exam_grade = 0.75;
  }
  
  // Extract item number patterns
  if (!extracted.item_number) {
    const itemPatterns = [
      /item\s*#?\s*[:.]?\s*([A-Z0-9-]+)/i,
      /part\s*#?\s*[:.]?\s*([A-Z0-9-]+)/i,
      /product\s*code\s*[:.]?\s*([A-Z0-9-]+)/i,
    ];
    for (const pattern of itemPatterns) {
      const match = text.match(pattern);
      if (match) {
        extracted.item_number = match[1].trim();
        scores.item_number = 0.6;
        break;
      }
    }
  }
}

// ============================================================================
// NORMALIZATION HELPERS
// ============================================================================

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[-|]\s*.+$/, '') // Remove site name suffix
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMaterial(value: string): string {
  const lower = value.toLowerCase();
  for (const [material, patterns] of Object.entries(MATERIAL_PATTERNS)) {
    if (patterns.some(p => p.test(lower))) {
      return material;
    }
  }
  return value;
}

function normalizeSize(value: string): string {
  const lower = value.toLowerCase().trim();
  
  // Check in order from most specific to least specific
  const sizeOrder = ['XXL', 'XL', 'XS', 'L', 'M', 'S'];
  for (const size of sizeOrder) {
    const patterns = SIZE_PATTERNS[size];
    if (patterns && patterns.some(p => p.test(lower))) {
      return size;
    }
  }
  return value.toUpperCase();
}

function normalizeExtractedData(extracted: ExtractedProductData): void {
  // Clean up strings
  if (extracted.title) {
    extracted.title = extracted.title.trim();
  }
  if (extracted.description) {
    extracted.description = extracted.description.trim().substring(0, 2000);
  }
  
  // Normalize material
  if (extracted.material) {
    extracted.material = normalizeMaterial(extracted.material);
  }
  
  // Normalize size
  if (extracted.size) {
    extracted.size = normalizeSize(extracted.size);
  }
  
  // Calculate units_per_box and boxes_per_case if we have total
  if (extracted.total_units_per_case && extracted.pack_size && !extracted.boxes_per_case) {
    const boxes = extracted.total_units_per_case / extracted.pack_size;
    if (Number.isInteger(boxes)) {
      extracted.boxes_per_case = boxes;
      extracted.units_per_box = extracted.pack_size;
    }
  }
  
  // Set units_per_box from pack_size if not set
  if (!extracted.units_per_box && extracted.pack_size) {
    extracted.units_per_box = extracted.pack_size;
  }
  
  // Calculate price per unit
  if (extracted.price && extracted.pack_size) {
    extracted.price_per_unit = extracted.price / extracted.pack_size;
  }
  
  // Collect all attributes
  extracted.all_attributes = { ...extracted };
}
