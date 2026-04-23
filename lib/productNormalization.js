/**
 * GloveCubs Product Intake and Catalog Normalization
 * 
 * Converts raw supplier data into clean, normalized catalog format.
 */

// ==============================================================================
// NORMALIZATION CONSTANTS
// ==============================================================================

const MATERIALS = {
  'nitrile': ['nitrile', 'nit', 'nbr'],
  'vinyl': ['vinyl', 'pvc', 'vyl'],
  'latex': ['latex', 'rubber', 'natural rubber', 'nr'],
  'poly': ['poly', 'polyethylene', 'pe', 'hdpe', 'ldpe'],
  'hybrid': ['hybrid', 'blend', 'nitrile-vinyl', 'synmax', 'vitex'],
  'neoprene': ['neoprene', 'chloroprene'],
  'butyl': ['butyl'],
  'pva': ['pva', 'polyvinyl alcohol']
};

const COLORS = {
  'black': ['black', 'blk', 'onyx', 'raven', 'midnight'],
  'blue': ['blue', 'blu', 'cobalt', 'royal'],
  'indigo': ['indigo', 'dark blue', 'navy'],
  'purple': ['purple', 'violet', 'grape'],
  'white': ['white', 'wht', 'ivory'],
  'clear': ['clear', 'transparent', 'clr'],
  'orange': ['orange', 'hi-vis orange', 'safety orange', 'org'],
  'green': ['green', 'grn', 'lime', 'teal'],
  'pink': ['pink', 'rose'],
  'yellow': ['yellow', 'ylw'],
  'gray': ['gray', 'grey', 'charcoal']
};

const GRADES = {
  'exam': ['exam', 'examination', 'medical exam'],
  'medical': ['medical', 'surgical', 'hospital', 'healthcare'],
  'industrial': ['industrial', 'ind', 'general purpose', 'gp', 'work'],
  'foodservice': ['food', 'foodservice', 'food service', 'food-safe', 'fda'],
  'utility': ['utility', 'household', 'cleaning', 'janitorial'],
  'chemo': ['chemo', 'chemotherapy', 'cytotoxic'],
  'cleanroom': ['cleanroom', 'clean room', 'class 100']
};

const TEXTURES = {
  'textured': ['textured', 'micro-textured', 'fully textured'],
  'smooth': ['smooth'],
  'diamond': ['diamond', 'diamond grip', 'raised diamond'],
  'fingertip': ['fingertip textured', 'finger textured', 'textured fingertips']
};

const CATEGORIES = {
  'Disposable Gloves': ['disposable', 'exam', 'nitrile', 'vinyl', 'latex', 'poly'],
  'Work Gloves': ['work', 'coated', 'cut resistant', 'cut-resistant', 'impact', 'leather'],
  'Chemical Gloves': ['chemical', 'solvent', 'acid'],
  'Heat Resistant Gloves': ['heat', 'thermal', 'hot', 'welding'],
  'Cut Resistant Gloves': ['cut resistant', 'cut-resistant', 'ansi a'],
  'Disposable Apparel': ['coverall', 'gown', 'apron', 'sleeve', 'shoe cover', 'bouffant', 'beard', 'hair net']
};

// ==============================================================================
// PARSING UTILITIES
// ==============================================================================

function normalizeString(str) {
  if (!str) return '';
  return String(str).trim().toLowerCase();
}

function extractNumber(str) {
  if (!str) return null;
  const match = String(str).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

function findMatch(value, mapping) {
  const normalized = normalizeString(value);
  for (const [canonical, variants] of Object.entries(mapping)) {
    for (const variant of variants) {
      if (normalized.includes(variant)) {
        return canonical;
      }
    }
  }
  return null;
}

// ==============================================================================
// FIELD NORMALIZERS
// ==============================================================================

function normalizeMaterial(raw) {
  return findMatch(raw, MATERIALS) || 'unknown';
}

function normalizeColor(raw) {
  return findMatch(raw, COLORS) || 'unknown';
}

function normalizeGrade(raw) {
  return findMatch(raw, GRADES) || 'unknown';
}

function normalizeTexture(raw) {
  return findMatch(raw, TEXTURES) || 'unknown';
}

function normalizeThickness(raw) {
  if (!raw) return null;
  const str = String(raw).toLowerCase();
  
  // Already in mil
  let match = str.match(/([\d.]+)\s*mil/);
  if (match) return parseFloat(match[1]);
  
  // In mm - convert to mil (1 mil = 0.0254 mm)
  match = str.match(/([\d.]+)\s*mm/);
  if (match) return Math.round(parseFloat(match[1]) / 0.0254 * 10) / 10;
  
  // In grams (glove weight) - approximate conversion
  match = str.match(/([\d.]+)\s*g(?:ram)?s?/i);
  if (match) {
    const grams = parseFloat(match[1]);
    // Rough conversion: 3g ≈ 3mil, 4g ≈ 4mil, etc.
    return Math.round(grams * 10) / 10;
  }
  
  // Just a number
  const num = extractNumber(raw);
  if (num && num >= 1 && num <= 20) return num;
  
  return null;
}

function normalizeSize(raw) {
  if (!raw) return null;
  const str = normalizeString(raw);
  
  const sizeMap = {
    'xs': 'XS', 'x-small': 'XS', 'extra small': 'XS', 'extra-small': 'XS',
    's': 'S', 'small': 'S', 'sm': 'S',
    'm': 'M', 'medium': 'M', 'med': 'M',
    'l': 'L', 'large': 'L', 'lg': 'L',
    'xl': 'XL', 'x-large': 'XL', 'extra large': 'XL', 'extra-large': 'XL',
    'xxl': 'XXL', '2xl': 'XXL', 'xx-large': 'XXL',
    'xxxl': 'XXXL', '3xl': 'XXXL'
  };
  
  // Check for numeric sizes (surgical gloves)
  const numMatch = str.match(/^(\d+\.?\d*)$/);
  if (numMatch) return numMatch[1];
  
  return sizeMap[str] || str.toUpperCase();
}

function parseSizesAvailable(raw) {
  if (!raw) return [];
  const str = String(raw);
  
  // Split by common delimiters
  const parts = str.split(/[,\/\s]+/).filter(Boolean);
  return parts.map(normalizeSize).filter(s => s && s !== 'UNKNOWN');
}

function normalizePackQuantity(raw) {
  if (!raw) return null;
  const num = extractNumber(raw);
  
  // Sanity check for typical glove pack sizes
  if (num && [10, 12, 25, 50, 100, 150, 200, 250, 300, 500, 1000].includes(num)) {
    return num;
  }
  
  return num;
}

function parseCategory(raw, material, grade) {
  // Try to infer from raw product name
  if (raw) {
    for (const [category, keywords] of Object.entries(CATEGORIES)) {
      for (const keyword of keywords) {
        if (normalizeString(raw).includes(keyword)) {
          return category;
        }
      }
    }
  }
  
  // Infer from material
  if (['nitrile', 'vinyl', 'latex', 'poly', 'hybrid'].includes(material)) {
    return 'Disposable Gloves';
  }
  
  return 'Gloves';
}

function parseSubcategory(material, grade) {
  if (!material || material === 'unknown') return null;
  
  const materialMap = {
    'nitrile': 'Nitrile Gloves',
    'vinyl': 'Vinyl Gloves',
    'latex': 'Latex Gloves',
    'poly': 'Poly Gloves',
    'hybrid': 'Hybrid Gloves'
  };
  
  return materialMap[material] || null;
}

// ==============================================================================
// COMPLIANCE FLAGS
// ==============================================================================

function parseComplianceFlags(raw) {
  const str = normalizeString(raw);
  
  return {
    exam_grade: /exam|examination|510\(k\)|medical/.test(str),
    medical_grade: /medical|surgical|hospital|510\(k\)|fda cleared/.test(str),
    food_safe: /food|fda|nsf/.test(str),
    latex_free: /latex[- ]?free|no latex|nitrile|vinyl|poly/.test(str),
    powder_free: /powder[- ]?free|pf|unpowdered/.test(str),
    chemo_rated: /chemo|chemotherapy|astm d6978/.test(str),
    fentanyl_resistant: /fentanyl/.test(str)
  };
}

// ==============================================================================
// TITLE AND BULLET GENERATION
// ==============================================================================

function generateCanonicalTitle(product) {
  const parts = [];
  
  // Brand
  if (product.brand && product.brand !== 'unknown') {
    parts.push(product.brand);
  }
  
  // Color
  if (product.color && product.color !== 'unknown') {
    parts.push(capitalize(product.color));
  }
  
  // Material
  if (product.material && product.material !== 'unknown') {
    parts.push(capitalize(product.material));
  }
  
  // Grade
  if (product.grade && product.grade !== 'unknown') {
    parts.push(capitalize(product.grade));
  }
  
  parts.push('Gloves');
  
  // Specs
  const specs = [];
  if (product.thickness_mil) {
    specs.push(`${product.thickness_mil} Mil`);
  }
  if (product.units_per_box) {
    specs.push(`${product.units_per_box}/Box`);
  }
  if (product.size && product.size !== 'unknown') {
    specs.push(product.size);
  }
  
  let title = parts.join(' ');
  if (specs.length > 0) {
    title += ', ' + specs.join(', ');
  }
  
  return title;
}

function generateBulletPoints(product) {
  const bullets = [];
  
  // Material + grade
  if (product.material && product.material !== 'unknown') {
    let bullet = `${capitalize(product.material)} construction`;
    if (product.grade && product.grade !== 'unknown') {
      bullet += ` - ${product.grade} grade`;
    }
    bullets.push(bullet);
  }
  
  // Thickness
  if (product.thickness_mil) {
    bullets.push(`${product.thickness_mil} mil thickness for ${product.thickness_mil >= 6 ? 'heavy-duty' : 'standard'} protection`);
  }
  
  // Compliance
  const compliance = [];
  if (product.powder_free) compliance.push('powder-free');
  if (product.latex_free) compliance.push('latex-free');
  if (compliance.length > 0) {
    bullets.push(`${capitalize(compliance.join(' and '))} formula`);
  }
  
  // Texture
  if (product.texture && product.texture !== 'unknown') {
    bullets.push(`${capitalize(product.texture)} surface for enhanced grip`);
  }
  
  // Pack info
  if (product.units_per_box && product.boxes_per_case) {
    bullets.push(`${product.units_per_box} gloves per box, ${product.boxes_per_case} boxes per case (${product.total_units_per_case} total)`);
  } else if (product.units_per_box) {
    bullets.push(`${product.units_per_box} gloves per box`);
  }
  
  // Use cases
  const useCases = [];
  if (product.medical_grade || product.exam_grade) useCases.push('medical');
  if (product.food_safe) useCases.push('food handling');
  if (product.grade === 'industrial') useCases.push('industrial');
  if (useCases.length > 0) {
    bullets.push(`Ideal for ${useCases.join(', ')} applications`);
  }
  
  return bullets.slice(0, 5);
}

function generateKeywords(product) {
  const keywords = new Set();
  
  // Add all relevant terms
  if (product.brand) keywords.add(product.brand.toLowerCase());
  if (product.material) keywords.add(`${product.material} gloves`);
  if (product.color) keywords.add(`${product.color} gloves`);
  if (product.grade) keywords.add(`${product.grade} gloves`);
  
  if (product.powder_free) keywords.add('powder free gloves');
  if (product.latex_free) keywords.add('latex free gloves');
  if (product.exam_grade) keywords.add('exam gloves');
  if (product.medical_grade) keywords.add('medical gloves');
  if (product.food_safe) keywords.add('food safe gloves');
  
  if (product.manufacturer_part_number) {
    keywords.add(product.manufacturer_part_number.toLowerCase());
  }
  
  // Common search terms
  keywords.add('disposable gloves');
  keywords.add('safety gloves');
  
  return Array.from(keywords);
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ==============================================================================
// VALIDATION AND CONFIDENCE SCORING
// ==============================================================================

function validateAndScore(product) {
  const issues = [];
  let score = 1.0;
  
  // Critical field checks
  if (!product.material || product.material === 'unknown') {
    issues.push('Missing material');
    score -= 0.15;
  }
  
  if (!product.brand) {
    issues.push('Missing brand');
    score -= 0.05;
  }
  
  if (!product.units_per_box) {
    issues.push('Missing pack quantity');
    score -= 0.10;
  }
  
  if (!product.supplier_sku && !product.manufacturer_part_number) {
    issues.push('No SKU or MPN');
    score -= 0.10;
  }
  
  // Sanity checks
  if (product.thickness_mil) {
    if (product.thickness_mil < 1 || product.thickness_mil > 20) {
      issues.push(`Suspicious thickness: ${product.thickness_mil} mil`);
      score -= 0.15;
    }
  }
  
  if (product.units_per_box && product.boxes_per_case && product.total_units_per_case) {
    const expected = product.units_per_box * product.boxes_per_case;
    if (expected !== product.total_units_per_case) {
      issues.push(`Case math mismatch: ${product.units_per_box} x ${product.boxes_per_case} ≠ ${product.total_units_per_case}`);
      score -= 0.20;
    }
  }
  
  // Impossible combinations
  if (product.material === 'latex' && product.latex_free) {
    issues.push('Impossible: latex material marked latex-free');
    score -= 0.30;
  }
  
  if (product.material === 'nitrile' && !product.latex_free) {
    // Nitrile is inherently latex-free, might be data issue
    issues.push('Nitrile should be latex-free');
    score -= 0.05;
  }
  
  // Price sanity
  if (product.current_cost) {
    const cost = parseFloat(product.current_cost);
    if (cost < 1 || cost > 500) {
      issues.push(`Suspicious cost: $${cost}`);
      score -= 0.10;
    }
  }
  
  // Clamp score
  score = Math.max(0, Math.min(1, score));
  
  return {
    parse_confidence: Math.round(score * 100) / 100,
    review_required: score < 0.85,
    review_reasons: issues
  };
}

// ==============================================================================
// MAIN NORMALIZATION FUNCTION
// ==============================================================================

function normalizeProduct(rawData, supplierId = null) {
  // Parse raw input
  const raw = typeof rawData === 'string' ? { product_name_raw: rawData } : rawData;
  
  // Combine all text fields for pattern matching
  const allText = [
    raw.product_name_raw || raw.name || raw.title || raw.description || '',
    raw.description || raw.desc || '',
    raw.category || '',
    raw.material || '',
    raw.specs || ''
  ].join(' ');
  
  // Extract compliance flags
  const compliance = parseComplianceFlags(allText);
  
  // Build normalized product
  const product = {
    supplier_id: supplierId || raw.supplier_id || null,
    supplier_sku: raw.supplier_sku || raw.sku || raw.item_number || null,
    brand: raw.brand || null,
    manufacturer: raw.manufacturer || raw.brand || null,
    manufacturer_part_number: raw.manufacturer_part_number || raw.mpn || raw.part_number || null,
    upc: raw.upc || raw.gtin || null,
    product_name_raw: raw.product_name_raw || raw.name || raw.title || '',
    
    // Normalized fields
    material: normalizeMaterial(raw.material || allText),
    grade: normalizeGrade(raw.grade || allText),
    color: normalizeColor(raw.color || allText),
    texture: normalizeTexture(raw.texture || allText),
    thickness_mil: normalizeThickness(raw.thickness || raw.thickness_mil || allText),
    size: normalizeSize(raw.size),
    sizes_available: parseSizesAvailable(raw.sizes_available || raw.sizes || raw.size_range),
    
    // Pack quantities
    units_per_box: normalizePackQuantity(raw.units_per_box || raw.pack_qty || raw.box_count),
    boxes_per_case: extractNumber(raw.boxes_per_case || raw.case_pack),
    
    // Compliance
    ...compliance,
    
    // Pricing
    current_cost: raw.current_cost || raw.cost || raw.wholesale_price || null,
    map_price: raw.map_price || raw.map || null,
    msrp: raw.msrp || raw.retail_price || raw.price || null,
    
    // Inventory
    stock_status: raw.stock_status || raw.availability || 'unknown',
    lead_time_days: extractNumber(raw.lead_time_days || raw.lead_time),
    
    // Will be generated
    canonical_title: null,
    category: null,
    subcategory: null,
    description_short: null,
    bullet_points: [],
    keywords: []
  };
  
  // Calculate total units per case
  if (product.units_per_box && product.boxes_per_case) {
    product.total_units_per_case = product.units_per_box * product.boxes_per_case;
  } else {
    product.total_units_per_case = extractNumber(raw.total_units_per_case || raw.case_qty);
  }
  
  // Infer boxes_per_case if we have total and units_per_box
  if (!product.boxes_per_case && product.units_per_box && product.total_units_per_case) {
    product.boxes_per_case = Math.round(product.total_units_per_case / product.units_per_box);
  }
  
  // Set category and subcategory
  product.category = parseCategory(product.product_name_raw, product.material, product.grade);
  product.subcategory = parseSubcategory(product.material, product.grade);
  
  // Generate canonical title
  product.canonical_title = generateCanonicalTitle(product);
  
  // Generate bullets
  product.bullet_points = generateBulletPoints(product);
  
  // Generate keywords
  product.keywords = generateKeywords(product);
  
  // Generate short description
  product.description_short = product.bullet_points.slice(0, 2).join('. ') + '.';
  
  // Case pack notes
  if (product.units_per_box && product.boxes_per_case) {
    product.case_pack_notes = `${product.units_per_box}/box, ${product.boxes_per_case} boxes/case`;
  }
  
  // Validate and score
  const validation = validateAndScore(product);
  Object.assign(product, validation);
  
  return product;
}

// ==============================================================================
// BATCH PROCESSING
// ==============================================================================

function normalizeProducts(rawProducts, supplierId = null) {
  return rawProducts.map(raw => normalizeProduct(raw, supplierId));
}

function generateNormalizationReport(products) {
  const approved = products.filter(p => !p.review_required);
  const needsReview = products.filter(p => p.review_required);
  
  // Collect all issues
  const issueFrequency = {};
  products.forEach(p => {
    p.review_reasons.forEach(reason => {
      issueFrequency[reason] = (issueFrequency[reason] || 0) + 1;
    });
  });
  
  return {
    total_products: products.length,
    approved_count: approved.length,
    review_required_count: needsReview.length,
    approval_rate: Math.round((approved.length / products.length) * 100),
    average_confidence: Math.round(products.reduce((sum, p) => sum + p.parse_confidence, 0) / products.length * 100) / 100,
    issue_frequency: issueFrequency,
    review_queue: needsReview.map(p => ({
      sku: p.supplier_sku || p.manufacturer_part_number,
      name: p.product_name_raw,
      confidence: p.parse_confidence,
      issues: p.review_reasons
    }))
  };
}

// ==============================================================================
// EXPORTS
// ==============================================================================

module.exports = {
  normalizeProduct,
  normalizeProducts,
  generateNormalizationReport,
  normalizeMaterial,
  normalizeColor,
  normalizeGrade,
  normalizeThickness,
  normalizeSize,
  parseSizesAvailable,
  generateCanonicalTitle,
  generateBulletPoints,
  generateKeywords,
  validateAndScore
};
