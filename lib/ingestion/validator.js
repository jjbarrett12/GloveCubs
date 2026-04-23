/**
 * Product validation and confidence scoring.
 * Generates review flags for items needing human attention.
 */

const {
  CONFIDENCE_SOURCES,
  FLAG_TYPES,
  MATERIALS,
  COLORS,
  THICKNESS_RANGE,
  validateProduct,
} = require('./schema');

const CRITICAL_FIELDS = ['supplier_sku', 'material', 'supplier_cost'];
const IMPORTANT_FIELDS = ['canonical_title', 'category', 'pack_qty', 'color'];
const OPTIONAL_FIELDS = ['thickness_mil', 'powder', 'grade', 'texture', 'cuff_style'];

function calculateFieldConfidence(product) {
  const scores = {};
  
  scores.supplier_sku = product.supplier_sku ? CONFIDENCE_SOURCES.EXPLICIT_COLUMN : CONFIDENCE_SOURCES.MISSING;
  scores.canonical_title = product._confidence?.canonical_title || (product.canonical_title ? CONFIDENCE_SOURCES.DEFAULT_VALUE : CONFIDENCE_SOURCES.MISSING);
  scores.brand = product.brand ? (product._confidence?.brand || CONFIDENCE_SOURCES.EXPLICIT_COLUMN) : CONFIDENCE_SOURCES.MISSING;
  
  scores.material = product._confidence?.material?.confidence || (product.material ? CONFIDENCE_SOURCES.DEFAULT_VALUE : CONFIDENCE_SOURCES.MISSING);
  scores.thickness_mil = product._confidence?.thickness_mil?.confidence || (product.thickness_mil ? CONFIDENCE_SOURCES.DEFAULT_VALUE : CONFIDENCE_SOURCES.MISSING);
  scores.color = product._confidence?.color?.confidence || (product.color ? CONFIDENCE_SOURCES.DEFAULT_VALUE : CONFIDENCE_SOURCES.MISSING);
  scores.powder = product._confidence?.powder?.confidence || (product.powder ? CONFIDENCE_SOURCES.DEFAULT_VALUE : CONFIDENCE_SOURCES.MISSING);
  scores.grade = product._confidence?.grade?.confidence || (product.grade ? CONFIDENCE_SOURCES.DEFAULT_VALUE : CONFIDENCE_SOURCES.MISSING);
  
  scores.pack_qty = product._confidence?.pack_qty?.confidence || CONFIDENCE_SOURCES.DEFAULT_VALUE;
  scores.case_qty = product._confidence?.case_qty?.confidence || CONFIDENCE_SOURCES.DEFAULT_VALUE;
  
  scores.supplier_cost = product.supplier_cost != null ? CONFIDENCE_SOURCES.EXPLICIT_COLUMN : CONFIDENCE_SOURCES.MISSING;
  
  scores.category = product._confidence?.category || (product.category ? CONFIDENCE_SOURCES.DEFAULT_VALUE : CONFIDENCE_SOURCES.MISSING);
  scores.subcategory = product._confidence?.subcategory || (product.subcategory ? CONFIDENCE_SOURCES.DEFAULT_VALUE : CONFIDENCE_SOURCES.MISSING);
  
  scores.short_description = product._confidence?.short_description || (product.short_description ? CONFIDENCE_SOURCES.DEFAULT_VALUE : CONFIDENCE_SOURCES.MISSING);
  scores.bullet_features = product._confidence?.bullet_features || (product.bullet_features?.length > 0 ? CONFIDENCE_SOURCES.DEFAULT_VALUE : CONFIDENCE_SOURCES.MISSING);
  scores.search_keywords = product._confidence?.search_keywords || (product.search_keywords?.length > 0 ? CONFIDENCE_SOURCES.DEFAULT_VALUE : CONFIDENCE_SOURCES.MISSING);
  
  scores.primary_image = product.primary_image ? CONFIDENCE_SOURCES.EXPLICIT_COLUMN : CONFIDENCE_SOURCES.MISSING;
  
  return scores;
}

function calculateOverallConfidence(fieldConfidence) {
  const criticalScores = CRITICAL_FIELDS.map(f => fieldConfidence[f] || 0);
  const importantScores = IMPORTANT_FIELDS.map(f => fieldConfidence[f] || 0);
  
  const criticalAvg = criticalScores.reduce((a, b) => a + b, 0) / criticalScores.length;
  const importantAvg = importantScores.reduce((a, b) => a + b, 0) / importantScores.length;
  
  return criticalAvg * 0.6 + importantAvg * 0.4;
}

function generateFlags(product, fieldConfidence) {
  const flags = [...(product._flags || [])];
  
  for (const field of CRITICAL_FIELDS) {
    if ((fieldConfidence[field] || 0) < 0.3) {
      flags.push({
        ...FLAG_TYPES.MISSING_CRITICAL,
        attribute_key: field,
        message: `Critical field "${field}" is missing or has very low confidence`,
      });
    }
  }
  
  for (const field of IMPORTANT_FIELDS) {
    if ((fieldConfidence[field] || 0) < 0.3) {
      flags.push({
        ...FLAG_TYPES.MISSING_IMPORTANT,
        attribute_key: field,
        message: `Important field "${field}" is missing`,
      });
    }
  }
  
  for (const [field, score] of Object.entries(fieldConfidence)) {
    if (score > 0 && score < 0.5 && !CRITICAL_FIELDS.includes(field)) {
      flags.push({
        ...FLAG_TYPES.LOW_CONFIDENCE,
        attribute_key: field,
        message: `Field "${field}" has low confidence (${(score * 100).toFixed(0)}%)`,
        payload: { confidence: score },
      });
    }
  }
  
  if (product.material && !Object.keys(MATERIALS).includes(product.material)) {
    flags.push({
      ...FLAG_TYPES.VOCABULARY_MISMATCH,
      attribute_key: 'material',
      message: `Material "${product.material}" not in controlled vocabulary`,
    });
  }
  
  if (product.color && !COLORS.includes(product.color.toLowerCase())) {
    flags.push({
      ...FLAG_TYPES.VOCABULARY_MISMATCH,
      attribute_key: 'color',
      message: `Color "${product.color}" not in standard list`,
    });
  }
  
  if (product.thickness_mil) {
    const t = parseFloat(product.thickness_mil);
    if (isNaN(t) || t < THICKNESS_RANGE.min || t > THICKNESS_RANGE.max) {
      flags.push({
        ...FLAG_TYPES.VOCABULARY_MISMATCH,
        attribute_key: 'thickness_mil',
        message: `Thickness ${product.thickness_mil} outside expected range (${THICKNESS_RANGE.min}-${THICKNESS_RANGE.max})`,
      });
    }
  }
  
  if (product.supplier_cost != null) {
    const cost = parseFloat(product.supplier_cost);
    if (!isNaN(cost)) {
      if (cost < 1) {
        flags.push({
          ...FLAG_TYPES.PRICE_ANOMALY,
          attribute_key: 'supplier_cost',
          message: `Unusually low cost: $${cost.toFixed(2)}`,
        });
      }
      if (cost > 200) {
        flags.push({
          ...FLAG_TYPES.PRICE_ANOMALY,
          attribute_key: 'supplier_cost',
          message: `Unusually high cost: $${cost.toFixed(2)}`,
        });
      }
    }
  }
  
  if (!product.primary_image && (!product.images || product.images.length === 0)) {
    flags.push({
      ...FLAG_TYPES.IMAGE_MISSING,
      message: 'No product images available',
    });
  }
  
  return flags;
}

function validateAndScore(product) {
  const schemaValidation = validateProduct(product);
  const fieldConfidence = calculateFieldConfidence(product);
  const overallConfidence = calculateOverallConfidence(fieldConfidence);
  const flags = generateFlags(product, fieldConfidence);
  
  const hasErrors = flags.some(f => f.severity === 'error');
  const status = hasErrors ? 'review_required' : (overallConfidence >= 0.7 ? 'pending' : 'review_required');
  
  return {
    valid: schemaValidation.valid,
    schemaErrors: schemaValidation.errors,
    schemaWarnings: schemaValidation.warnings,
    fieldConfidence,
    overallConfidence,
    flags,
    status,
  };
}

async function checkDuplicate(product, existingSkus) {
  if (!product.supplier_sku) return null;
  
  const sku = product.supplier_sku.toUpperCase();
  
  if (existingSkus && existingSkus.has(sku)) {
    return {
      ...FLAG_TYPES.POSSIBLE_DUPLICATE,
      attribute_key: 'supplier_sku',
      message: `SKU "${product.supplier_sku}" already exists in the catalog`,
      payload: { existing_sku: sku },
    };
  }
  
  return null;
}

function validateBatch(products) {
  const results = [];
  const seenSkus = new Set();
  const duplicatesInBatch = new Map();
  
  for (const product of products) {
    const sku = (product.supplier_sku || '').toUpperCase();
    if (sku) {
      if (seenSkus.has(sku)) {
        duplicatesInBatch.set(sku, (duplicatesInBatch.get(sku) || 1) + 1);
      }
      seenSkus.add(sku);
    }
  }
  
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const validation = validateAndScore(product);
    
    const sku = (product.supplier_sku || '').toUpperCase();
    if (duplicatesInBatch.has(sku)) {
      validation.flags.push({
        ...FLAG_TYPES.POSSIBLE_DUPLICATE,
        attribute_key: 'supplier_sku',
        message: `SKU "${product.supplier_sku}" appears ${duplicatesInBatch.get(sku)} times in this batch`,
      });
    }
    
    results.push({
      index: i,
      product,
      ...validation,
    });
  }
  
  const summary = {
    total: results.length,
    valid: results.filter(r => r.valid).length,
    pending: results.filter(r => r.status === 'pending').length,
    reviewRequired: results.filter(r => r.status === 'review_required').length,
    avgConfidence: results.reduce((sum, r) => sum + r.overallConfidence, 0) / results.length,
    flagCounts: {},
  };
  
  for (const r of results) {
    for (const flag of r.flags) {
      summary.flagCounts[flag.type] = (summary.flagCounts[flag.type] || 0) + 1;
    }
  }
  
  return { results, summary };
}

module.exports = {
  calculateFieldConfidence,
  calculateOverallConfidence,
  generateFlags,
  validateAndScore,
  checkDuplicate,
  validateBatch,
  CRITICAL_FIELDS,
  IMPORTANT_FIELDS,
  OPTIONAL_FIELDS,
};
