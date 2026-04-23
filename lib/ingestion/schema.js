/**
 * Normalized product schema with validation and controlled vocabularies.
 * Single source of truth for product ingestion pipeline.
 */

const MATERIALS = {
  nitrile: { label: 'Nitrile', aliases: ['nitrile'] },
  latex: { label: 'Latex', aliases: ['latex', 'natural rubber'] },
  vinyl: { label: 'Vinyl', aliases: ['vinyl', 'pvc'] },
  polyethylene: { label: 'Polyethylene', aliases: ['polyethylene', 'pe', 'poly'] },
  neoprene: { label: 'Neoprene', aliases: ['neoprene', 'chloroprene'] },
  hppe_nitrile: { label: 'HPPE/Nitrile', aliases: ['hppe nitrile', 'hppe/nitrile'] },
  nylon_nitrile: { label: 'Nylon/Nitrile', aliases: ['nylon nitrile', 'nylon/nitrile'] },
  leather: { label: 'Leather', aliases: ['leather', 'cowhide', 'goatskin'] },
  cotton: { label: 'Cotton', aliases: ['cotton', 'jersey'] },
  kevlar: { label: 'Kevlar', aliases: ['kevlar', 'aramid'] },
  blended: { label: 'Blended', aliases: ['blended', 'mixed'] },
};

const COLORS = [
  'blue', 'black', 'white', 'purple', 'orange', 'green', 'tan', 'gray',
  'grey', 'brown', 'pink', 'yellow', 'navy', 'red', 'natural', 'clear', 'silver', 'beige'
];

const POWDER_OPTIONS = ['powder_free', 'powdered'];
const STERILITY_OPTIONS = ['sterile', 'non_sterile'];

const GRADES = {
  medical_exam: { label: 'Medical / Exam Grade', keywords: ['exam', 'medical', 'examination', 'healthcare', 'clinical'] },
  industrial: { label: 'Industrial Grade', keywords: ['industrial', 'manufacturing', 'warehouse', 'general purpose'] },
  food_service: { label: 'Food Service Grade', keywords: ['food', 'restaurant', 'kitchen', 'culinary', 'food safe'] },
  janitorial: { label: 'Janitorial Grade', keywords: ['janitorial', 'sanitation', 'cleaning', 'custodial'] },
  automotive: { label: 'Automotive Grade', keywords: ['automotive', 'mechanic', 'garage', 'oil'] },
};

const INDUSTRIES = [
  'healthcare', 'food_service', 'food_processing', 'janitorial', 'sanitation',
  'laboratories', 'pharmaceuticals', 'beauty_personal_care', 'tattoo_body_art',
  'automotive', 'education', 'manufacturing', 'construction', 'warehouse'
];

const COMPLIANCE = [
  'fda_approved', 'astm_tested', 'food_safe', 'latex_free', 'chemo_rated',
  'en_455', 'en_374', 'ansi_cut_rated', 'arc_flash_rated'
];

const TEXTURES = ['smooth', 'fingertip_textured', 'fully_textured', 'micro_textured'];
const CUFF_STYLES = ['beaded_cuff', 'non_beaded', 'extended_cuff', 'knit_wrist'];
const CATEGORIES = ['disposable_gloves', 'reusable_work_gloves'];

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL'];
const THICKNESS_RANGE = { min: 1, max: 20 };

const CANONICAL_BRANDS = {
  hospeco: 'Hospeco',
  'global glove': 'Global Glove',
  'mcr safety': 'MCR Safety',
  'wells lamont': 'Wells Lamont',
  safeko: 'Safeko',
  ambitex: 'Ambitex',
  ansell: 'Ansell',
  showa: 'SHOWA',
  pip: 'PIP',
  microflex: 'Microflex',
  kimberly: 'Kimberly-Clark',
  'kimberly-clark': 'Kimberly-Clark',
  honeywell: 'Honeywell',
  superior: 'Superior Glove',
  majestic: 'Majestic Glove',
  cordova: 'Cordova Safety',
  west: 'West Chester',
  'west chester': 'West Chester',
  liberty: 'Liberty Glove',
  memphis: 'Memphis Glove',
  magid: 'Magid',
  ammex: 'AMMEX',
  'dash medical': 'Dash Medical',
  aurelia: 'Aurelia',
  cranberry: 'Cranberry',
};

const CONFIDENCE_SOURCES = {
  EXPLICIT_COLUMN: 1.0,
  REGEX_TITLE: 0.9,
  REGEX_DESCRIPTION: 0.8,
  AI_CLASSIFICATION: 0.7,
  AI_GENERATION: 0.6,
  INFERRED_SIMILAR: 0.5,
  DEFAULT_VALUE: 0.3,
  MISSING: 0.0,
};

const FLAG_TYPES = {
  MISSING_CRITICAL: { type: 'missing_critical', severity: 'error' },
  MISSING_IMPORTANT: { type: 'missing_important', severity: 'warning' },
  LOW_CONFIDENCE: { type: 'low_confidence', severity: 'warning' },
  VOCABULARY_MISMATCH: { type: 'vocabulary_mismatch', severity: 'warning' },
  POSSIBLE_DUPLICATE: { type: 'possible_duplicate', severity: 'warning' },
  PRICE_ANOMALY: { type: 'price_anomaly', severity: 'warning' },
  IMAGE_MISSING: { type: 'image_missing', severity: 'warning' },
  AI_ENRICHED: { type: 'ai_enriched', severity: 'info' },
};

function createEmptyProduct() {
  return {
    supplier_sku: null,
    internal_sku: null,
    canonical_title: null,
    brand: null,
    manufacturer_part_number: null,
    upc: null,
    
    material: null,
    thickness_mil: null,
    color: null,
    powder: null,
    sterility: null,
    grade: null,
    size_range: [],
    texture: null,
    cuff_style: null,
    
    pack_qty: null,
    case_qty: null,
    boxes_per_case: null,
    
    supplier_cost: null,
    suggested_price: null,
    bulk_price: null,
    
    short_description: null,
    long_description: null,
    bullet_features: [],
    technical_specs: {},
    search_keywords: [],
    seo_slug: null,
    
    category: null,
    subcategory: null,
    industries: [],
    compliance: [],
    
    primary_image: null,
    images: [],
    
    _raw: null,
    _confidence: {},
    _flags: [],
    _enriched_fields: [],
  };
}

function validateProduct(product) {
  const errors = [];
  const warnings = [];
  
  if (!product.supplier_sku) {
    errors.push({ field: 'supplier_sku', message: 'Supplier SKU is required' });
  }
  
  if (!product.canonical_title && !product._raw?.name) {
    errors.push({ field: 'canonical_title', message: 'Product title is required' });
  }
  
  if (product.material && !Object.keys(MATERIALS).includes(product.material)) {
    warnings.push({ field: 'material', message: `Unknown material: ${product.material}` });
  }
  
  if (product.color && !COLORS.includes(product.color.toLowerCase())) {
    warnings.push({ field: 'color', message: `Non-standard color: ${product.color}` });
  }
  
  if (product.thickness_mil) {
    const t = parseFloat(product.thickness_mil);
    if (isNaN(t) || t < THICKNESS_RANGE.min || t > THICKNESS_RANGE.max) {
      warnings.push({ field: 'thickness_mil', message: `Thickness ${product.thickness_mil} outside expected range` });
    }
  }
  
  if (product.supplier_cost != null) {
    const c = parseFloat(product.supplier_cost);
    if (isNaN(c) || c < 0) {
      errors.push({ field: 'supplier_cost', message: 'Invalid supplier cost' });
    }
    if (c > 500) {
      warnings.push({ field: 'supplier_cost', message: `Unusually high cost: $${c}` });
    }
  }
  
  if (product.pack_qty && (product.pack_qty < 1 || product.pack_qty > 10000)) {
    warnings.push({ field: 'pack_qty', message: `Unusual pack quantity: ${product.pack_qty}` });
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

function normalizeBrand(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[®™]/g, '').trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  return CANONICAL_BRANDS[lower] || cleaned;
}

function normalizeColor(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().trim();
  if (lower === 'grey') return 'gray';
  if (COLORS.includes(lower)) return lower;
  for (const c of COLORS) {
    if (lower.includes(c)) return c;
  }
  return raw.trim();
}

function normalizeMaterial(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().trim();
  for (const [key, { aliases }] of Object.entries(MATERIALS)) {
    for (const alias of aliases) {
      if (lower.includes(alias)) return key;
    }
  }
  return null;
}

function inferGrade(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [key, { keywords }] of Object.entries(GRADES)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return key;
    }
  }
  return null;
}

function inferIndustries(text, grade, material) {
  const industries = new Set();
  const lower = (text || '').toLowerCase();
  
  if (grade === 'medical_exam' || /\b(exam|medical|healthcare|clinical)\b/.test(lower)) {
    industries.add('healthcare');
  }
  if (grade === 'food_service' || /\b(food|restaurant|kitchen)\b/.test(lower)) {
    industries.add('food_service');
  }
  if (/\b(janitor|sanitation|cleaning)\b/.test(lower)) {
    industries.add('janitorial');
  }
  if (/\b(lab|laboratory|pharma)\b/.test(lower)) {
    industries.add('laboratories');
  }
  if (/\b(auto|mechanic|garage)\b/.test(lower)) {
    industries.add('automotive');
  }
  if (/\b(tattoo|salon|beauty)\b/.test(lower)) {
    industries.add('beauty_personal_care');
  }
  
  return Array.from(industries);
}

function inferCategory(material, subcategory, text) {
  const t = (text || '').toLowerCase();
  const sub = (subcategory || '').toLowerCase();
  
  if (/\bwork\s*glove|cut\s*resistant|coated|impact|leather|reusable\b/.test(t + ' ' + sub)) {
    return 'reusable_work_gloves';
  }
  if (/\bdisposable|exam|nitrile|latex|vinyl\b/.test(t + ' ' + (material || ''))) {
    return 'disposable_gloves';
  }
  return 'disposable_gloves';
}

function generateSlug(brand, material, color, thickness, sku) {
  const parts = [brand, material, color, thickness ? `${thickness}-mil` : null]
    .filter(Boolean)
    .map(s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  const base = parts.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const skuSafe = String(sku || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${base}-${skuSafe}`.substring(0, 100) || `product-${Date.now()}`;
}

function generateInternalSku(supplierSku, supplierId) {
  const clean = String(supplierSku || '').replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
  return `GC-${clean}`;
}

module.exports = {
  MATERIALS,
  COLORS,
  POWDER_OPTIONS,
  STERILITY_OPTIONS,
  GRADES,
  INDUSTRIES,
  COMPLIANCE,
  TEXTURES,
  CUFF_STYLES,
  CATEGORIES,
  SIZES,
  THICKNESS_RANGE,
  CANONICAL_BRANDS,
  CONFIDENCE_SOURCES,
  FLAG_TYPES,
  
  createEmptyProduct,
  validateProduct,
  normalizeBrand,
  normalizeColor,
  normalizeMaterial,
  inferGrade,
  inferIndustries,
  inferCategory,
  generateSlug,
  generateInternalSku,
};
