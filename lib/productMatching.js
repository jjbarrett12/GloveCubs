/**
 * GloveCubs Product Matching and Deduplication Agent
 * 
 * Compares incoming supplier products against the existing catalog
 * to identify matches, variants, duplicates, or new products.
 */

// ==============================================================================
// MATCHING WEIGHTS AND THRESHOLDS
// ==============================================================================

const FIELD_WEIGHTS = {
  manufacturer_part_number: 50,  // Strongest signal
  upc: 45,                       // Very strong
  brand: 15,
  material: 12,
  color: 10,
  thickness_mil: 10,
  grade: 10,
  units_per_box: 8,
  boxes_per_case: 5,
  total_units_per_case: 5,
  size: 3,                       // Size alone doesn't make a match
  texture: 3,
  powder_free: 2,
  latex_free: 2
};

const THRESHOLDS = {
  exact_match: 0.95,
  likely_match: 0.85,
  variant: 0.70,
  possible_match: 0.50,
  review: 0.40
};

// Fields that MUST match for an exact match
const CRITICAL_FIELDS = ['units_per_box', 'material'];

// Fields that define variants (different = variant, not duplicate)
const VARIANT_FIELDS = ['color', 'size', 'thickness_mil'];

// Fields that should NEVER differ for same product
const CONFLICT_FIELDS = ['material', 'grade', 'units_per_box', 'boxes_per_case'];

// ==============================================================================
// STRING SIMILARITY
// ==============================================================================

function normalizeString(str) {
  if (!str) return '';
  return String(str).toLowerCase().trim()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '');
}

function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}

function stringSimilarity(str1, str2) {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  
  if (!s1 && !s2) return 1.0;  // Both empty = match
  if (!s1 || !s2) return 0.0;   // One empty = no match
  if (s1 === s2) return 1.0;    // Exact = perfect
  
  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);
  
  return 1 - (distance / maxLen);
}

// ==============================================================================
// FIELD COMPARISON
// ==============================================================================

function compareField(field, val1, val2) {
  // Handle null/undefined
  if (val1 === null || val1 === undefined || val1 === '') {
    return { match: false, score: 0, reason: 'incoming_missing' };
  }
  if (val2 === null || val2 === undefined || val2 === '') {
    return { match: false, score: 0, reason: 'catalog_missing' };
  }
  
  // Numeric fields
  if (['thickness_mil', 'units_per_box', 'boxes_per_case', 'total_units_per_case'].includes(field)) {
    const num1 = parseFloat(val1);
    const num2 = parseFloat(val2);
    if (isNaN(num1) || isNaN(num2)) {
      return { match: false, score: 0, reason: 'non_numeric' };
    }
    if (num1 === num2) {
      return { match: true, score: 1.0, reason: 'exact_numeric' };
    }
    // Close but not exact
    const diff = Math.abs(num1 - num2) / Math.max(num1, num2);
    if (diff < 0.1) {
      return { match: false, score: 0.8, reason: 'close_numeric' };
    }
    return { match: false, score: 0, reason: 'different_numeric' };
  }
  
  // Boolean fields
  if (['powder_free', 'latex_free', 'exam_grade', 'medical_grade', 'food_safe'].includes(field)) {
    const bool1 = Boolean(val1);
    const bool2 = Boolean(val2);
    return { match: bool1 === bool2, score: bool1 === bool2 ? 1.0 : 0, reason: bool1 === bool2 ? 'bool_match' : 'bool_differ' };
  }
  
  // String fields - use similarity
  const similarity = stringSimilarity(val1, val2);
  
  if (similarity >= 0.95) {
    return { match: true, score: 1.0, reason: 'exact_string' };
  } else if (similarity >= 0.85) {
    return { match: true, score: similarity, reason: 'fuzzy_match' };
  } else if (similarity >= 0.70) {
    return { match: false, score: similarity, reason: 'similar' };
  } else {
    return { match: false, score: 0, reason: 'different' };
  }
}

// ==============================================================================
// PRODUCT MATCHING
// ==============================================================================

function matchProducts(incoming, catalogProduct) {
  const matchedFields = [];
  const conflictingFields = [];
  const partialFields = [];
  let totalWeight = 0;
  let matchedWeight = 0;
  
  // Check each field
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    const incomingVal = incoming[field];
    const catalogVal = catalogProduct[field];
    
    // Skip if both are missing
    if ((incomingVal === null || incomingVal === undefined || incomingVal === '') &&
        (catalogVal === null || catalogVal === undefined || catalogVal === '')) {
      continue;
    }
    
    totalWeight += weight;
    const comparison = compareField(field, incomingVal, catalogVal);
    
    if (comparison.match) {
      matchedWeight += weight * comparison.score;
      matchedFields.push({
        field,
        incoming: incomingVal,
        catalog: catalogVal,
        score: comparison.score
      });
    } else if (comparison.score > 0) {
      matchedWeight += weight * comparison.score * 0.5; // Partial credit
      partialFields.push({
        field,
        incoming: incomingVal,
        catalog: catalogVal,
        score: comparison.score,
        reason: comparison.reason
      });
    } else if (comparison.reason !== 'incoming_missing' && comparison.reason !== 'catalog_missing') {
      conflictingFields.push({
        field,
        incoming: incomingVal,
        catalog: catalogVal,
        reason: comparison.reason
      });
    }
  }
  
  // Calculate base confidence
  let confidence = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  
  // Apply bonuses and penalties
  
  // Strong MPN/UPC match bonus
  const mpnMatch = matchedFields.find(f => f.field === 'manufacturer_part_number');
  const upcMatch = matchedFields.find(f => f.field === 'upc');
  if (mpnMatch || upcMatch) {
    confidence = Math.min(1.0, confidence + 0.15);
  }
  
  // Critical field conflict penalty
  for (const conflict of conflictingFields) {
    if (CRITICAL_FIELDS.includes(conflict.field)) {
      confidence *= 0.5; // Heavy penalty
    }
    if (CONFLICT_FIELDS.includes(conflict.field)) {
      confidence *= 0.7;
    }
  }
  
  // Pack size mismatch = never exact match
  const packConflict = conflictingFields.find(f => 
    f.field === 'units_per_box' || f.field === 'total_units_per_case'
  );
  if (packConflict) {
    confidence = Math.min(confidence, 0.65); // Cap at variant level
  }
  
  return {
    confidence: Math.round(confidence * 100) / 100,
    matchedFields,
    conflictingFields,
    partialFields
  };
}

function determineMatchResult(comparison) {
  const { confidence, conflictingFields, matchedFields } = comparison;
  
  // Check for variant-defining conflicts
  const variantConflicts = conflictingFields.filter(f => VARIANT_FIELDS.includes(f.field));
  const criticalConflicts = conflictingFields.filter(f => CRITICAL_FIELDS.includes(f.field));
  
  // Has MPN or UPC match?
  const hasIdentifierMatch = matchedFields.some(f => 
    f.field === 'manufacturer_part_number' || f.field === 'upc'
  );
  
  // Determine result
  if (confidence >= THRESHOLDS.exact_match && criticalConflicts.length === 0) {
    if (variantConflicts.length > 0) {
      return 'variant';
    }
    return 'exact_match';
  }
  
  if (confidence >= THRESHOLDS.likely_match) {
    if (variantConflicts.length > 0) {
      return 'variant';
    }
    if (criticalConflicts.length > 0) {
      return 'review';
    }
    return 'likely_match';
  }
  
  if (confidence >= THRESHOLDS.variant && hasIdentifierMatch) {
    return 'variant';
  }
  
  if (confidence >= THRESHOLDS.possible_match) {
    return 'review';
  }
  
  return 'new_product';
}

function determineAction(matchResult, comparison) {
  switch (matchResult) {
    case 'exact_match':
      return 'link_to_existing';
    case 'likely_match':
      return comparison.conflictingFields.length > 0 ? 'human_review' : 'link_to_existing';
    case 'variant':
      return 'create_variant';
    case 'duplicate':
      return 'link_to_existing';
    case 'review':
      return 'human_review';
    case 'new_product':
    default:
      return 'create_new_canonical';
  }
}

function generateReasoning(matchResult, comparison, incoming, catalog) {
  const parts = [];
  
  // Matched identifiers
  const mpnMatch = comparison.matchedFields.find(f => f.field === 'manufacturer_part_number');
  const upcMatch = comparison.matchedFields.find(f => f.field === 'upc');
  
  if (mpnMatch) {
    parts.push(`MPN match: ${mpnMatch.incoming}`);
  }
  if (upcMatch) {
    parts.push(`UPC match: ${upcMatch.incoming}`);
  }
  
  // Matched attributes
  const attrMatches = comparison.matchedFields.filter(f => 
    !['manufacturer_part_number', 'upc'].includes(f.field)
  );
  if (attrMatches.length > 0) {
    parts.push(`${attrMatches.length} attributes match (${attrMatches.map(f => f.field).join(', ')})`);
  }
  
  // Conflicts
  if (comparison.conflictingFields.length > 0) {
    const conflictNames = comparison.conflictingFields.map(f => 
      `${f.field}: ${f.incoming} vs ${f.catalog}`
    );
    parts.push(`Conflicts: ${conflictNames.join('; ')}`);
  }
  
  // Result explanation
  switch (matchResult) {
    case 'exact_match':
      parts.push('High confidence exact match - same product from different supplier.');
      break;
    case 'likely_match':
      parts.push('Likely the same product but minor data differences.');
      break;
    case 'variant':
      parts.push('Same base product but different variant (size/color/thickness).');
      break;
    case 'review':
      parts.push('Uncertain match - requires human review.');
      break;
    case 'new_product':
      parts.push('No match found - appears to be a new product.');
      break;
  }
  
  return parts.join(' | ');
}

// ==============================================================================
// MAIN MATCHING FUNCTION
// ==============================================================================

function findMatches(incomingProduct, catalogProducts, options = {}) {
  const { minConfidence = 0.30, maxResults = 5 } = options;
  
  const matches = [];
  
  for (const catalogProduct of catalogProducts) {
    const comparison = matchProducts(incomingProduct, catalogProduct);
    
    if (comparison.confidence >= minConfidence) {
      const matchResult = determineMatchResult(comparison);
      const action = determineAction(matchResult, comparison);
      const reasoning = generateReasoning(matchResult, comparison, incomingProduct, catalogProduct);
      
      matches.push({
        incoming_supplier_product_id: incomingProduct.supplier_sku || incomingProduct.id,
        match_result: matchResult,
        canonical_product_id: catalogProduct.id || catalogProduct.sku,
        canonical_product_name: catalogProduct.name || catalogProduct.canonical_title,
        match_confidence: comparison.confidence,
        reasoning,
        matched_fields: comparison.matchedFields.map(f => f.field),
        conflicting_fields: comparison.conflictingFields.map(f => ({
          field: f.field,
          incoming: f.incoming,
          catalog: f.catalog
        })),
        recommended_action: action
      });
    }
  }
  
  // Sort by confidence descending
  matches.sort((a, b) => b.match_confidence - a.match_confidence);
  
  return matches.slice(0, maxResults);
}

function matchSingleProduct(incomingProduct, catalogProducts) {
  const matches = findMatches(incomingProduct, catalogProducts, { maxResults: 1 });
  
  if (matches.length === 0) {
    return {
      incoming_supplier_product_id: incomingProduct.supplier_sku || incomingProduct.id,
      match_result: 'new_product',
      canonical_product_id: null,
      match_confidence: 0,
      reasoning: 'No similar products found in catalog.',
      matched_fields: [],
      conflicting_fields: [],
      recommended_action: 'create_new_canonical'
    };
  }
  
  return matches[0];
}

// ==============================================================================
// BATCH PROCESSING
// ==============================================================================

function matchProductBatch(incomingProducts, catalogProducts, options = {}) {
  const results = {
    processed: 0,
    exact_matches: 0,
    likely_matches: 0,
    variants: 0,
    new_products: 0,
    reviews_required: 0,
    matches: []
  };
  
  for (const incoming of incomingProducts) {
    const match = matchSingleProduct(incoming, catalogProducts);
    results.matches.push(match);
    results.processed++;
    
    switch (match.match_result) {
      case 'exact_match':
        results.exact_matches++;
        break;
      case 'likely_match':
        results.likely_matches++;
        break;
      case 'variant':
        results.variants++;
        break;
      case 'new_product':
        results.new_products++;
        break;
      case 'review':
        results.reviews_required++;
        break;
    }
  }
  
  return results;
}

function generateMatchingReport(results) {
  let report = '';
  report += '\n' + '═'.repeat(60) + '\n';
  report += '     PRODUCT MATCHING REPORT\n';
  report += '═'.repeat(60) + '\n\n';
  
  report += `Total Processed:     ${results.processed}\n`;
  report += `Exact Matches:       ${results.exact_matches}\n`;
  report += `Likely Matches:      ${results.likely_matches}\n`;
  report += `Variants:            ${results.variants}\n`;
  report += `New Products:        ${results.new_products}\n`;
  report += `Reviews Required:    ${results.reviews_required}\n`;
  
  // Action summary
  const actions = {};
  results.matches.forEach(m => {
    actions[m.recommended_action] = (actions[m.recommended_action] || 0) + 1;
  });
  
  report += '\nRecommended Actions:\n';
  for (const [action, count] of Object.entries(actions)) {
    report += `  ${action}: ${count}\n`;
  }
  
  // Review queue
  const reviewQueue = results.matches.filter(m => 
    m.recommended_action === 'human_review' || m.match_result === 'review'
  );
  
  if (reviewQueue.length > 0) {
    report += '\nReview Queue:\n';
    reviewQueue.slice(0, 10).forEach(m => {
      report += `  [${m.match_confidence}] ${m.incoming_supplier_product_id}\n`;
      report += `     → ${m.canonical_product_id || 'No match'}: ${m.reasoning.slice(0, 60)}...\n`;
    });
    if (reviewQueue.length > 10) {
      report += `  ... and ${reviewQueue.length - 10} more\n`;
    }
  }
  
  report += '\n' + '═'.repeat(60) + '\n';
  
  return report;
}

// ==============================================================================
// DUPLICATE DETECTION
// ==============================================================================

function findDuplicatesInCatalog(catalogProducts) {
  const duplicates = [];
  const checked = new Set();
  
  for (let i = 0; i < catalogProducts.length; i++) {
    if (checked.has(i)) continue;
    
    const product = catalogProducts[i];
    const duplicateGroup = [{ index: i, product }];
    
    for (let j = i + 1; j < catalogProducts.length; j++) {
      if (checked.has(j)) continue;
      
      const comparison = matchProducts(product, catalogProducts[j]);
      
      if (comparison.confidence >= THRESHOLDS.likely_match) {
        const matchResult = determineMatchResult(comparison);
        if (matchResult === 'exact_match' || matchResult === 'likely_match') {
          duplicateGroup.push({
            index: j,
            product: catalogProducts[j],
            confidence: comparison.confidence,
            conflicts: comparison.conflictingFields
          });
          checked.add(j);
        }
      }
    }
    
    if (duplicateGroup.length > 1) {
      duplicates.push(duplicateGroup);
    }
  }
  
  return duplicates;
}

// ==============================================================================
// EXPORTS
// ==============================================================================

module.exports = {
  findMatches,
  matchSingleProduct,
  matchProductBatch,
  generateMatchingReport,
  findDuplicatesInCatalog,
  matchProducts,
  determineMatchResult,
  compareField,
  stringSimilarity,
  THRESHOLDS,
  FIELD_WEIGHTS
};
