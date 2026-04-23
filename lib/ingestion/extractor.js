/**
 * Attribute extraction from product text and structured data.
 * Uses regex patterns + heuristics for reliable extraction.
 */

const {
  MATERIALS,
  COLORS,
  SIZES,
  THICKNESS_RANGE,
  GRADES,
  CONFIDENCE_SOURCES,
} = require('./schema');

const MATERIAL_PATTERNS = [
  { pattern: /\bhppe\b.*\bnitrile\b|\bnitrile\b.*\bhppe\b/i, value: 'hppe_nitrile', priority: 0 },
  { pattern: /\bnylon\b.*\bnitrile\b|\bnitrile\b.*\bnylon\b/i, value: 'nylon_nitrile', priority: 0 },
  { pattern: /\bnitrile\b/i, value: 'nitrile', priority: 1 },
  { pattern: /\blatex\b(?!\s*-?\s*free)/i, value: 'latex', priority: 1 },
  { pattern: /\bvinyl\b|\bpvc\b/i, value: 'vinyl', priority: 1 },
  { pattern: /\bpoly(?:ethylene)?\b|\bpe\s*glove/i, value: 'polyethylene', priority: 2 },
  { pattern: /\bneoprene\b/i, value: 'neoprene', priority: 1 },
  { pattern: /\bleather\b|\bcowhide\b|\bgoatskin\b/i, value: 'leather', priority: 1 },
  { pattern: /\bkevlar\b|\baramid\b/i, value: 'kevlar', priority: 1 },
  { pattern: /\bcotton\b|\bjersey\b/i, value: 'cotton', priority: 2 },
];

const THICKNESS_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*[-]?\s*mil\b/i,
  /\b(\d+(?:\.\d+)?)\s*mm\b/i,
  /(?:thickness|thk)[:\s]*(\d+(?:\.\d+)?)/i,
];

const POWDER_PATTERNS = {
  powder_free: [
    /\bpowder[- ]?free\b/i,
    /\bpf\b(?!\s*glove)/i,
    /\bnon[- ]?powdered\b/i,
  ],
  powdered: [
    /\bpowdered\b/i,
    /\bwith\s+powder\b/i,
  ],
};

const STERILITY_PATTERNS = {
  sterile: [/\bsterile\b/i, /\bsterilized\b/i],
  non_sterile: [/\bnon[- ]?sterile\b/i],
};

const SIZE_PATTERNS = [
  /\b(xs|x-?small)\b/i,
  /\b(sm|small|s)\b(?![a-z])/i,
  /\b(md|medium|m)\b(?![a-z])/i,
  /\b(lg|large|l)\b(?![a-z])/i,
  /\b(xl|x-?large)\b/i,
  /\b(xxl|2xl|xx-?large)\b/i,
  /\b(3xl|xxxl)\b/i,
  /\b(4xl)\b/i,
];

const PACK_QTY_PATTERNS = [
  { pattern: /(\d+)\s*(?:\/|per)\s*(?:box|bx|pk|pack)\b/i, group: 1 },
  { pattern: /(?:box|bx)\s*(?:of\s*)?(\d+)\b/i, group: 1 },
  { pattern: /(\d+)\s*ct\s*(?:box|bx)/i, group: 1 },
  { pattern: /(\d+)\s*(?:gloves?\s*)?(?:\/|per)\s*bx/i, group: 1 },
  { pattern: /(?:inner\s*(?:qty|quantity))[:\s]*(\d+)/i, group: 1 },
];

const CASE_QTY_PATTERNS = [
  { pattern: /(\d+)\s*(?:\/|per)\s*(?:case|cs)\b/i, group: 1 },
  { pattern: /(?:case|cs)\s*(?:of\s*)?(\d+)\b/i, group: 1 },
  { pattern: /(\d+)\s*(?:bx|boxes?)\s*(?:\/|per)\s*(?:case|cs)\b/i, group: 1, isBoxCount: true },
  { pattern: /(?:outer\s*(?:qty|quantity))[:\s]*(\d+)/i, group: 1 },
];

const TEXTURE_PATTERNS = {
  smooth: [/\bsmooth\b/i],
  fingertip_textured: [/\bfinger\s*tip\s*textured?\b/i, /\btextured?\s*finger\s*tips?\b/i],
  fully_textured: [/\bfully\s*textured?\b/i, /\btextured?\s*(?:throughout|all)\b/i],
  micro_textured: [/\bmicro[- ]?textured?\b/i],
};

const CUFF_PATTERNS = {
  beaded_cuff: [/\bbeaded\s*cuff\b/i],
  extended_cuff: [/\bextended\s*cuff\b/i, /\blong\s*cuff\b/i, /\b1[2-8][\"\'\s]*(?:inch|in)?\s*(?:cuff|length)\b/i],
  knit_wrist: [/\bknit\s*wrist\b/i],
};

const COMPLIANCE_PATTERNS = {
  fda_approved: [/\bfda\s*(?:approved|cleared|compliant)\b/i, /\b510\s*\(?k\)?\b/i],
  astm_tested: [/\bastm\b/i],
  food_safe: [/\bfood\s*safe\b/i, /\bfood\s*grade\b/i, /\bfood\s*contact\b/i],
  latex_free: [/\blatex[- ]?free\b/i],
  chemo_rated: [/\bchemo\s*(?:rated|tested|approved)\b/i, /\bchemotherapy\b/i],
  ansi_cut_rated: [/\bansi\s*(?:cut\s*)?a[1-9]\b/i],
};

function extractMaterial(titleText, columnValue, descriptionText) {
  const combined = [columnValue, titleText, descriptionText].filter(Boolean).join(' ');
  
  if (columnValue) {
    const normalized = require('./schema').normalizeMaterial(columnValue);
    if (normalized) {
      return { value: normalized, confidence: CONFIDENCE_SOURCES.EXPLICIT_COLUMN, source: 'column' };
    }
  }
  
  const sortedPatterns = [...MATERIAL_PATTERNS].sort((a, b) => a.priority - b.priority);
  for (const { pattern, value } of sortedPatterns) {
    if (pattern.test(titleText || '')) {
      return { value, confidence: CONFIDENCE_SOURCES.REGEX_TITLE, source: 'title' };
    }
  }
  
  for (const { pattern, value } of sortedPatterns) {
    if (pattern.test(descriptionText || '')) {
      return { value, confidence: CONFIDENCE_SOURCES.REGEX_DESCRIPTION, source: 'description' };
    }
  }
  
  return { value: null, confidence: CONFIDENCE_SOURCES.MISSING, source: null };
}

function extractThickness(titleText, columnValue, descriptionText) {
  if (columnValue) {
    const num = parseFloat(String(columnValue).replace(/[^\d.]/g, ''));
    if (!isNaN(num) && num >= THICKNESS_RANGE.min && num <= THICKNESS_RANGE.max) {
      return { value: String(num), confidence: CONFIDENCE_SOURCES.EXPLICIT_COLUMN, source: 'column' };
    }
  }
  
  const texts = [
    { text: titleText, confidence: CONFIDENCE_SOURCES.REGEX_TITLE, source: 'title' },
    { text: descriptionText, confidence: CONFIDENCE_SOURCES.REGEX_DESCRIPTION, source: 'description' },
  ];
  
  for (const { text, confidence, source } of texts) {
    if (!text) continue;
    for (const pattern of THICKNESS_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const num = parseFloat(match[1]);
        if (!isNaN(num) && num >= THICKNESS_RANGE.min && num <= THICKNESS_RANGE.max) {
          return { value: String(num), confidence, source };
        }
      }
    }
  }
  
  return { value: null, confidence: CONFIDENCE_SOURCES.MISSING, source: null };
}

function extractPowder(titleText, columnValue, descriptionText) {
  const combined = [columnValue, titleText, descriptionText].filter(Boolean).join(' ');
  
  if (columnValue) {
    const col = String(columnValue).toLowerCase();
    if (['powder-free', 'powder free', 'pf', 'powderfree'].some(s => col.includes(s))) {
      return { value: 'powder_free', confidence: CONFIDENCE_SOURCES.EXPLICIT_COLUMN, source: 'column' };
    }
    if (col.includes('powdered') && !col.includes('non')) {
      return { value: 'powdered', confidence: CONFIDENCE_SOURCES.EXPLICIT_COLUMN, source: 'column' };
    }
  }
  
  for (const pattern of POWDER_PATTERNS.powder_free) {
    if (pattern.test(combined)) {
      const conf = pattern.test(titleText || '') ? CONFIDENCE_SOURCES.REGEX_TITLE : CONFIDENCE_SOURCES.REGEX_DESCRIPTION;
      return { value: 'powder_free', confidence: conf, source: pattern.test(titleText || '') ? 'title' : 'description' };
    }
  }
  
  for (const pattern of POWDER_PATTERNS.powdered) {
    if (pattern.test(combined)) {
      const conf = pattern.test(titleText || '') ? CONFIDENCE_SOURCES.REGEX_TITLE : CONFIDENCE_SOURCES.REGEX_DESCRIPTION;
      return { value: 'powdered', confidence: conf, source: pattern.test(titleText || '') ? 'title' : 'description' };
    }
  }
  
  return { value: null, confidence: CONFIDENCE_SOURCES.MISSING, source: null };
}

function extractColor(titleText, columnValue, descriptionText) {
  if (columnValue) {
    const normalized = require('./schema').normalizeColor(columnValue);
    if (normalized && COLORS.includes(normalized.toLowerCase())) {
      return { value: normalized.toLowerCase(), confidence: CONFIDENCE_SOURCES.EXPLICIT_COLUMN, source: 'column' };
    }
  }
  
  const combined = [titleText, (descriptionText || '').slice(0, 500)].filter(Boolean).join(' ').toLowerCase();
  
  for (const color of COLORS) {
    const pattern = new RegExp(`\\b${color}\\b`, 'i');
    if (pattern.test(titleText || '')) {
      return { value: color === 'grey' ? 'gray' : color, confidence: CONFIDENCE_SOURCES.REGEX_TITLE, source: 'title' };
    }
  }
  
  for (const color of COLORS) {
    const pattern = new RegExp(`\\b${color}\\b`, 'i');
    if (pattern.test(descriptionText || '')) {
      return { value: color === 'grey' ? 'gray' : color, confidence: CONFIDENCE_SOURCES.REGEX_DESCRIPTION, source: 'description' };
    }
  }
  
  if (columnValue) {
    return { value: String(columnValue).trim().toLowerCase(), confidence: CONFIDENCE_SOURCES.EXPLICIT_COLUMN * 0.7, source: 'column_unvalidated' };
  }
  
  return { value: null, confidence: CONFIDENCE_SOURCES.MISSING, source: null };
}

function extractSizes(titleText, columnValue) {
  const sizes = new Set();
  
  if (columnValue) {
    const parts = String(columnValue).split(/[\s,;\/]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    for (const part of parts) {
      const normalized = normalizeSize(part);
      if (normalized) sizes.add(normalized);
    }
  }
  
  const texts = [titleText].filter(Boolean);
  for (const text of texts) {
    for (const pattern of SIZE_PATTERNS) {
      const matches = text.match(new RegExp(pattern.source, 'gi')) || [];
      for (const m of matches) {
        const normalized = normalizeSize(m);
        if (normalized) sizes.add(normalized);
      }
    }
  }
  
  const result = [...sizes].sort((a, b) => {
    const order = SIZES;
    return order.indexOf(a) - order.indexOf(b);
  });
  
  return {
    value: result.length > 0 ? result : null,
    confidence: columnValue ? CONFIDENCE_SOURCES.EXPLICIT_COLUMN : (result.length > 0 ? CONFIDENCE_SOURCES.REGEX_TITLE : CONFIDENCE_SOURCES.MISSING),
    source: columnValue ? 'column' : (result.length > 0 ? 'title' : null),
  };
}

function normalizeSize(raw) {
  const s = String(raw).toUpperCase().trim();
  const map = {
    'X-SMALL': 'XS', 'XSMALL': 'XS', 'XS': 'XS',
    'SMALL': 'S', 'SM': 'S', 'S': 'S',
    'MEDIUM': 'M', 'MD': 'M', 'MED': 'M', 'M': 'M',
    'LARGE': 'L', 'LG': 'L', 'L': 'L',
    'X-LARGE': 'XL', 'XLARGE': 'XL', 'XL': 'XL',
    'XX-LARGE': 'XXL', 'XXLARGE': 'XXL', '2XL': 'XXL', 'XXL': 'XXL',
    'XXX-LARGE': '3XL', '3XL': '3XL', 'XXXL': '3XL',
    '4XL': '4XL', 'XXXXL': '4XL',
  };
  return map[s] || (SIZES.includes(s) ? s : null);
}

function extractPackQty(titleText, columnValue) {
  if (columnValue) {
    const n = parseInt(String(columnValue).replace(/[^\d]/g, ''), 10);
    if (!isNaN(n) && n > 0 && n <= 10000) {
      return { value: n, confidence: CONFIDENCE_SOURCES.EXPLICIT_COLUMN, source: 'column' };
    }
  }
  
  const combined = [titleText].filter(Boolean).join(' ');
  for (const { pattern, group } of PACK_QTY_PATTERNS) {
    const match = combined.match(pattern);
    if (match && match[group]) {
      const n = parseInt(match[group], 10);
      if (!isNaN(n) && n > 0 && n <= 10000) {
        return { value: n, confidence: CONFIDENCE_SOURCES.REGEX_TITLE, source: 'title' };
      }
    }
  }
  
  return { value: 100, confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'default' };
}

function extractCaseQty(titleText, columnValue, packQty) {
  if (columnValue) {
    const n = parseInt(String(columnValue).replace(/[^\d]/g, ''), 10);
    if (!isNaN(n) && n > 0 && n <= 100000) {
      return { value: n, confidence: CONFIDENCE_SOURCES.EXPLICIT_COLUMN, source: 'column' };
    }
  }
  
  const combined = [titleText].filter(Boolean).join(' ');
  for (const { pattern, group, isBoxCount } of CASE_QTY_PATTERNS) {
    const match = combined.match(pattern);
    if (match && match[group]) {
      const n = parseInt(match[group], 10);
      if (!isNaN(n) && n > 0) {
        if (isBoxCount && packQty) {
          return { value: n * packQty, confidence: CONFIDENCE_SOURCES.REGEX_TITLE, source: 'title_calculated' };
        }
        if (!isBoxCount && n <= 100000) {
          return { value: n, confidence: CONFIDENCE_SOURCES.REGEX_TITLE, source: 'title' };
        }
      }
    }
  }
  
  const defaultCase = (packQty || 100) * 10;
  return { value: defaultCase, confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'default' };
}

function extractSterility(titleText, columnValue, descriptionText) {
  const combined = [columnValue, titleText, descriptionText].filter(Boolean).join(' ');
  
  for (const pattern of STERILITY_PATTERNS.sterile) {
    if (pattern.test(combined)) {
      const conf = pattern.test(titleText || '') ? CONFIDENCE_SOURCES.REGEX_TITLE : CONFIDENCE_SOURCES.REGEX_DESCRIPTION;
      return { value: 'sterile', confidence: conf, source: pattern.test(titleText || '') ? 'title' : 'description' };
    }
  }
  
  for (const pattern of STERILITY_PATTERNS.non_sterile) {
    if (pattern.test(combined)) {
      return { value: 'non_sterile', confidence: CONFIDENCE_SOURCES.REGEX_DESCRIPTION, source: 'description' };
    }
  }
  
  return { value: 'non_sterile', confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'default' };
}

function extractTexture(titleText, descriptionText) {
  const combined = [titleText, descriptionText].filter(Boolean).join(' ');
  
  for (const [value, patterns] of Object.entries(TEXTURE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        const conf = pattern.test(titleText || '') ? CONFIDENCE_SOURCES.REGEX_TITLE : CONFIDENCE_SOURCES.REGEX_DESCRIPTION;
        return { value, confidence: conf, source: pattern.test(titleText || '') ? 'title' : 'description' };
      }
    }
  }
  
  return { value: null, confidence: CONFIDENCE_SOURCES.MISSING, source: null };
}

function extractCuffStyle(titleText, descriptionText) {
  const combined = [titleText, descriptionText].filter(Boolean).join(' ');
  
  for (const [value, patterns] of Object.entries(CUFF_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        const conf = pattern.test(titleText || '') ? CONFIDENCE_SOURCES.REGEX_TITLE : CONFIDENCE_SOURCES.REGEX_DESCRIPTION;
        return { value, confidence: conf, source: pattern.test(titleText || '') ? 'title' : 'description' };
      }
    }
  }
  
  return { value: null, confidence: CONFIDENCE_SOURCES.MISSING, source: null };
}

function extractCompliance(titleText, descriptionText) {
  const combined = [titleText, descriptionText].filter(Boolean).join(' ');
  const found = [];
  
  for (const [value, patterns] of Object.entries(COMPLIANCE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        found.push(value);
        break;
      }
    }
  }
  
  return {
    value: found.length > 0 ? found : null,
    confidence: found.length > 0 ? CONFIDENCE_SOURCES.REGEX_DESCRIPTION : CONFIDENCE_SOURCES.MISSING,
    source: found.length > 0 ? 'text' : null,
  };
}

function extractGrade(titleText, descriptionText, columnValue) {
  if (columnValue) {
    const g = require('./schema').inferGrade(columnValue);
    if (g) return { value: g, confidence: CONFIDENCE_SOURCES.EXPLICIT_COLUMN, source: 'column' };
  }
  
  const combined = [titleText, descriptionText].filter(Boolean).join(' ');
  const g = require('./schema').inferGrade(combined);
  
  if (g) {
    const conf = require('./schema').inferGrade(titleText || '') ? CONFIDENCE_SOURCES.REGEX_TITLE : CONFIDENCE_SOURCES.REGEX_DESCRIPTION;
    return { value: g, confidence: conf, source: conf === CONFIDENCE_SOURCES.REGEX_TITLE ? 'title' : 'description' };
  }
  
  return { value: null, confidence: CONFIDENCE_SOURCES.MISSING, source: null };
}

function extractAllAttributes(row, columnLookup) {
  const title = row.title || row.name || row.product_name || '';
  const description = row.description || row.product_description || '';
  
  const get = (key, alts = []) => {
    const keys = [key, ...alts];
    for (const k of keys) {
      if (row[k] != null && row[k] !== '') return row[k];
      const lower = k.toLowerCase();
      for (const rk of Object.keys(row)) {
        if (rk.toLowerCase() === lower && row[rk] != null && row[rk] !== '') return row[rk];
      }
    }
    return null;
  };
  
  const material = extractMaterial(title, get('material', ['materials', 'material_type']), description);
  const thickness = extractThickness(title, get('thickness', ['thickness_mil', 'mil', 'thickness (mil)']), description);
  const powder = extractPowder(title, get('powder', ['powdered', 'powder_free']), description);
  const color = extractColor(title, get('color', ['colour', 'colors']), description);
  const sizes = extractSizes(title, get('sizes', ['size', 'sizing', 'size_options']));
  const packQty = extractPackQty(title, get('pack_qty', ['pack qty', 'packqty', 'box_qty', 'per_box', 'inner_qty']));
  const caseQty = extractCaseQty(title, get('case_qty', ['case qty', 'caseqty', 'case_size', 'outer_qty']), packQty.value);
  const sterility = extractSterility(title, get('sterility', ['sterile']), description);
  const texture = extractTexture(title, description);
  const cuffStyle = extractCuffStyle(title, description);
  const compliance = extractCompliance(title, description);
  const grade = extractGrade(title, description, get('grade', ['grade_type', 'use_case']));
  
  return {
    material,
    thickness_mil: thickness,
    powder,
    color,
    size_range: sizes,
    pack_qty: packQty,
    case_qty: caseQty,
    sterility,
    texture,
    cuff_style: cuffStyle,
    compliance,
    grade,
  };
}

module.exports = {
  extractMaterial,
  extractThickness,
  extractPowder,
  extractColor,
  extractSizes,
  extractPackQty,
  extractCaseQty,
  extractSterility,
  extractTexture,
  extractCuffStyle,
  extractCompliance,
  extractGrade,
  extractAllAttributes,
  normalizeSize,
};
