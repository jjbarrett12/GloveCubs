/**
 * GloveCubs QA and Self-Healing Supervisor Agent
 * 
 * Audits, verifies, corrects, and hardens outputs from all agents
 * before anything is approved, published, or used for pricing decisions.
 * 
 * Accuracy > Speed. Conservative > Aggressive. Review > False Certainty.
 */

// ==============================================================================
// CONFIGURATION
// ==============================================================================

const QA_CONFIG = {
  // Confidence thresholds
  min_confidence_auto_publish: 0.90,
  min_confidence_auto_fix: 0.85,
  confidence_downgrade_step: 0.10,
  
  // Margin protection
  min_margin_percent: 0.15,
  min_margin_dollars: 1.00,
  
  // Price change limits
  max_auto_publish_price_change: 0.05,
  max_price_swing_without_review: 0.07,
  
  // Data staleness
  max_competitor_data_age_days: 7,
  max_cost_data_age_days: 30,
  
  // Normalization maps
  color_normalize: {
    'blk': 'black', 'blu': 'blue', 'wht': 'white', 'clr': 'clear',
    'grn': 'green', 'org': 'orange', 'pnk': 'pink', 'pur': 'purple'
  },
  material_normalize: {
    'nitril': 'nitrile', 'nit': 'nitrile', 'vin': 'vinyl',
    'lat': 'latex', 'ltx': 'latex', 'poly': 'polyethylene'
  },
  grade_normalize: {
    'exam': 'exam', 'examination': 'exam', 'med': 'medical',
    'ind': 'industrial', 'indust': 'industrial', 'food': 'foodservice'
  }
};

// ==============================================================================
// AUDIT RESULT STRUCTURES
// ==============================================================================

function createAuditResult() {
  return {
    run_type: 'audit_and_fix',
    run_timestamp: new Date().toISOString(),
    summary: {
      records_audited: 0,
      issues_found: 0,
      safe_auto_fixes_applied: 0,
      items_sent_to_review: 0,
      items_blocked: 0,
      systemic_issues_found: 0
    },
    module_results: [],
    fixes: [],
    review_queue: [],
    blocked_actions: [],
    systemic_issues: [],
    next_steps: [],
    self_audit: null
  };
}

function createModuleResult(module) {
  return {
    module,
    records_checked: 0,
    issues_found: 0,
    fixes_applied: 0,
    review_items_created: 0,
    blocked_items: 0,
    notes: []
  };
}

// ==============================================================================
// SUPPLIER DISCOVERY AUDIT
// ==============================================================================

function auditSupplierDiscovery(suppliers, result) {
  const moduleResult = createModuleResult('supplier_discovery');
  const seen = new Map();
  
  for (const supplier of suppliers) {
    moduleResult.records_checked++;
    result.summary.records_audited++;
    
    // Check for duplicates
    const key = normalizeSupplierKey(supplier);
    if (seen.has(key)) {
      moduleResult.issues_found++;
      result.summary.issues_found++;
      
      if (supplier.trust_score < seen.get(key).trust_score) {
        result.blocked_actions.push({
          record_type: 'supplier',
          record_id: supplier.id || supplier.name,
          reason_blocked: 'Duplicate supplier - lower trust score version',
          priority: 'medium'
        });
        moduleResult.blocked_items++;
        result.summary.items_blocked++;
      }
      continue;
    }
    seen.set(key, supplier);
    
    // Check legitimacy signals
    const legitimacyIssues = checkSupplierLegitimacy(supplier);
    if (legitimacyIssues.length > 0) {
      moduleResult.issues_found += legitimacyIssues.length;
      result.summary.issues_found += legitimacyIssues.length;
      
      result.review_queue.push({
        record_type: 'supplier',
        record_id: supplier.id || supplier.name,
        issue_category: 'supplier_legitimacy',
        issue_summary: legitimacyIssues.join('; '),
        recommended_action: 'VERIFY - Confirm supplier is legitimate wholesaler',
        priority: legitimacyIssues.length > 2 ? 'high' : 'medium'
      });
      moduleResult.review_items_created++;
      result.summary.items_sent_to_review++;
    }
    
    // Apply safe normalizations
    const fixes = normalizeSupplierFields(supplier);
    if (fixes.length > 0) {
      for (const fix of fixes) {
        result.fixes.push({
          record_type: 'supplier',
          record_id: supplier.id || supplier.name,
          ...fix
        });
      }
      moduleResult.fixes_applied += fixes.length;
      result.summary.safe_auto_fixes_applied += fixes.length;
    }
  }
  
  result.module_results.push(moduleResult);
  return moduleResult;
}

function normalizeSupplierKey(supplier) {
  const name = (supplier.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const domain = extractDomain(supplier.website || supplier.url || '');
  return `${name}|${domain}`;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.toLowerCase().replace(/[^a-z0-9.]/g, '');
  }
}

function checkSupplierLegitimacy(supplier) {
  const issues = [];
  
  if (!supplier.website && !supplier.url) {
    issues.push('No website provided');
  } else {
    const site = (supplier.website || supplier.url || '').toLowerCase();
    if (site.includes('amazon.') || site.includes('ebay.') || site.includes('walmart.')) {
      issues.push('Website is a retail marketplace, not a wholesale supplier');
    }
  }
  
  if (!supplier.contact_email && !supplier.phone) {
    issues.push('Missing contact information');
  }
  
  if (supplier.type === 'retailer' || supplier.supplier_type === 'retailer') {
    issues.push('Classified as retailer, not wholesaler');
  }
  
  if (supplier.trust_score !== undefined && supplier.trust_score < 0.5) {
    issues.push(`Low trust score: ${supplier.trust_score}`);
  }
  
  if (supplier.minimum_order > 50000) {
    issues.push('Unusually high minimum order requirement');
  }
  
  return issues;
}

function normalizeSupplierFields(supplier) {
  const fixes = [];
  
  // Normalize supplier type
  const type = (supplier.type || supplier.supplier_type || '').toLowerCase();
  if (type && !['wholesaler', 'distributor', 'manufacturer', 'retailer'].includes(type)) {
    const normalized = type.includes('whole') ? 'wholesaler'
      : type.includes('dist') ? 'distributor'
      : type.includes('manu') ? 'manufacturer'
      : type.includes('ret') ? 'retailer' : null;
    
    if (normalized) {
      fixes.push({
        issue: `Non-standard supplier type: ${type}`,
        fix_applied: `Normalized to: ${normalized}`,
        confidence_after_fix: 0.95,
        audit_note: 'Safe mechanical normalization'
      });
      supplier.type = normalized;
    }
  }
  
  // Trim whitespace
  if (supplier.name && supplier.name !== supplier.name.trim()) {
    supplier.name = supplier.name.trim();
    fixes.push({
      issue: 'Extra whitespace in supplier name',
      fix_applied: 'Trimmed whitespace',
      confidence_after_fix: 1.0,
      audit_note: 'Safe formatting fix'
    });
  }
  
  return fixes;
}

// ==============================================================================
// PRODUCT INTAKE AUDIT
// ==============================================================================

function auditProductIntake(products, result) {
  const moduleResult = createModuleResult('product_intake');
  
  for (const product of products) {
    moduleResult.records_checked++;
    result.summary.records_audited++;
    
    const issues = [];
    const fixes = [];
    
    // Required field checks
    if (!product.brand) issues.push('Missing brand');
    if (!product.material) issues.push('Missing material');
    if (!product.units_per_box) issues.push('Missing units_per_box');
    
    // Case math check
    const mathResult = auditCaseMath(product);
    if (mathResult.issue) {
      issues.push(mathResult.issue);
      if (mathResult.fix) {
        fixes.push(mathResult.fix);
        product.total_units_per_case = mathResult.corrected_value;
      }
    }
    
    // Attribute normalization
    const normFixes = normalizeProductAttributes(product);
    fixes.push(...normFixes);
    
    // Thickness sanity check
    const thicknessIssue = checkThickness(product);
    if (thicknessIssue) issues.push(thicknessIssue);
    
    // Title consistency check
    const titleIssue = checkTitleConsistency(product);
    if (titleIssue) issues.push(titleIssue);
    
    // Confidence audit
    const confidenceIssue = auditParseConfidence(product, issues);
    if (confidenceIssue) {
      fixes.push(confidenceIssue.fix);
      product.parse_confidence = confidenceIssue.new_confidence;
      product.review_required = true;
    }
    
    // Record results
    moduleResult.issues_found += issues.length;
    result.summary.issues_found += issues.length;
    
    if (fixes.length > 0) {
      for (const fix of fixes) {
        result.fixes.push({
          record_type: 'product',
          record_id: product.id || product.sku || product.supplier_sku,
          ...fix
        });
      }
      moduleResult.fixes_applied += fixes.length;
      result.summary.safe_auto_fixes_applied += fixes.length;
    }
    
    // Determine if review needed
    const criticalIssues = issues.filter(i => 
      i.includes('Missing') || i.includes('conflict') || i.includes('suspicious')
    );
    
    if (criticalIssues.length > 0) {
      result.review_queue.push({
        record_type: 'product',
        record_id: product.id || product.sku || product.supplier_sku,
        issue_category: 'catalog_quality',
        issue_summary: criticalIssues.join('; '),
        recommended_action: 'VERIFY - Check product data before publishing',
        priority: criticalIssues.length >= 3 ? 'high' : 'medium'
      });
      moduleResult.review_items_created++;
      result.summary.items_sent_to_review++;
    }
  }
  
  result.module_results.push(moduleResult);
  return moduleResult;
}

function auditCaseMath(product) {
  const upb = parseFloat(product.units_per_box);
  const bpc = parseFloat(product.boxes_per_case);
  const total = parseFloat(product.total_units_per_case);
  
  if (!isNaN(upb) && !isNaN(bpc)) {
    const expected = upb * bpc;
    
    if (!isNaN(total) && total !== expected) {
      return {
        issue: `Case math incorrect: ${upb} × ${bpc} ≠ ${total}`,
        fix: {
          issue: `Incorrect total_units_per_case: ${total}`,
          fix_applied: `Corrected to: ${expected}`,
          confidence_after_fix: 0.95,
          audit_note: 'Math correction from verified components'
        },
        corrected_value: expected
      };
    }
    
    if (isNaN(total) || !total) {
      return {
        issue: null,
        fix: {
          issue: 'Missing total_units_per_case',
          fix_applied: `Calculated: ${expected}`,
          confidence_after_fix: 0.95,
          audit_note: 'Computed from units_per_box × boxes_per_case'
        },
        corrected_value: expected
      };
    }
  }
  
  return { issue: null, fix: null };
}

function normalizeProductAttributes(product) {
  const fixes = [];
  
  // Normalize color
  if (product.color) {
    const lower = product.color.toLowerCase();
    const normalized = QA_CONFIG.color_normalize[lower];
    if (normalized && normalized !== lower) {
      fixes.push({
        issue: `Non-standard color: ${product.color}`,
        fix_applied: `Normalized to: ${normalized}`,
        confidence_after_fix: 0.98,
        audit_note: 'Safe color normalization'
      });
      product.color = normalized;
    }
  }
  
  // Normalize material
  if (product.material) {
    const lower = product.material.toLowerCase();
    const normalized = QA_CONFIG.material_normalize[lower];
    if (normalized && normalized !== lower) {
      fixes.push({
        issue: `Non-standard material: ${product.material}`,
        fix_applied: `Normalized to: ${normalized}`,
        confidence_after_fix: 0.98,
        audit_note: 'Safe material normalization'
      });
      product.material = normalized;
    }
  }
  
  // Normalize grade
  if (product.grade) {
    const lower = product.grade.toLowerCase();
    const normalized = QA_CONFIG.grade_normalize[lower];
    if (normalized && normalized !== lower) {
      fixes.push({
        issue: `Non-standard grade: ${product.grade}`,
        fix_applied: `Normalized to: ${normalized}`,
        confidence_after_fix: 0.98,
        audit_note: 'Safe grade normalization'
      });
      product.grade = normalized;
    }
  }
  
  return fixes;
}

function checkThickness(product) {
  const thickness = parseFloat(product.thickness_mil || product.thickness);
  if (isNaN(thickness)) return null;
  
  if (thickness < 1 || thickness > 15) {
    return `Suspicious thickness: ${thickness} mil (normal range: 1-15)`;
  }
  return null;
}

function checkTitleConsistency(product) {
  const title = (product.canonical_title || product.title || '').toLowerCase();
  
  if (product.material && !title.includes(product.material.toLowerCase())) {
    return `Title missing material (${product.material})`;
  }
  
  if (product.color && !title.includes(product.color.toLowerCase())) {
    return `Title missing color (${product.color})`;
  }
  
  return null;
}

function auditParseConfidence(product, issues) {
  const confidence = product.parse_confidence || 1.0;
  
  // Downgrade if issues found
  const issueCount = issues.length;
  const missingCount = issues.filter(i => i.includes('Missing')).length;
  
  let newConfidence = confidence;
  let reason = '';
  
  if (missingCount >= 3) {
    newConfidence = Math.min(newConfidence, 0.60);
    reason = 'Multiple required fields missing';
  } else if (missingCount >= 1) {
    newConfidence = Math.min(newConfidence, 0.75);
    reason = 'Required field(s) missing';
  }
  
  if (issueCount >= 5) {
    newConfidence -= 0.15;
    reason = 'Many issues detected';
  } else if (issueCount >= 3) {
    newConfidence -= 0.10;
    reason = 'Multiple issues detected';
  }
  
  // Check for inflated confidence
  if (confidence > 0.90 && missingCount > 0) {
    newConfidence = Math.min(newConfidence, 0.80);
    reason = 'Confidence was inflated given missing fields';
  }
  
  if (newConfidence < confidence) {
    return {
      new_confidence: Math.max(0.30, newConfidence),
      fix: {
        issue: `Confidence score inflated: ${confidence}`,
        fix_applied: `Downgraded to: ${newConfidence.toFixed(2)}`,
        confidence_after_fix: newConfidence,
        audit_note: reason
      }
    };
  }
  
  return null;
}

// ==============================================================================
// PRODUCT MATCHING AUDIT
// ==============================================================================

function auditProductMatching(matches, result) {
  const moduleResult = createModuleResult('product_matching');
  
  for (const match of matches) {
    moduleResult.records_checked++;
    result.summary.records_audited++;
    
    const issues = [];
    const fixes = [];
    
    // Check for false exact matches
    if (match.match_result === 'exact_match') {
      const falseMatchIssue = checkForFalseExactMatch(match);
      if (falseMatchIssue) {
        issues.push(falseMatchIssue.issue);
        fixes.push(falseMatchIssue.fix);
        match.match_result = falseMatchIssue.new_result;
        match.match_confidence = falseMatchIssue.new_confidence;
      }
    }
    
    // Check confidence justification
    const confidenceIssue = auditMatchConfidence(match);
    if (confidenceIssue) {
      issues.push(confidenceIssue.issue);
      fixes.push(confidenceIssue.fix);
      match.match_confidence = confidenceIssue.new_confidence;
    }
    
    // Check for critical field conflicts
    const conflictIssue = checkCriticalFieldConflicts(match);
    if (conflictIssue) {
      issues.push(conflictIssue);
      
      result.blocked_actions.push({
        record_type: 'match',
        record_id: match.incoming_supplier_product_id,
        reason_blocked: conflictIssue,
        priority: 'high'
      });
      moduleResult.blocked_items++;
      result.summary.items_blocked++;
    }
    
    // Record results
    moduleResult.issues_found += issues.length;
    result.summary.issues_found += issues.length;
    
    for (const fix of fixes) {
      result.fixes.push({
        record_type: 'match',
        record_id: match.incoming_supplier_product_id,
        ...fix
      });
      moduleResult.fixes_applied++;
      result.summary.safe_auto_fixes_applied++;
    }
    
    // Send ambiguous matches to review
    if (match.match_confidence > 0.50 && match.match_confidence < QA_CONFIG.min_confidence_auto_fix) {
      result.review_queue.push({
        record_type: 'match',
        record_id: match.incoming_supplier_product_id,
        issue_category: 'ambiguous_match',
        issue_summary: `Match confidence ${Math.round(match.match_confidence * 100)}% - manual verification needed`,
        recommended_action: 'VERIFY - Confirm products are equivalent',
        priority: 'medium'
      });
      moduleResult.review_items_created++;
      result.summary.items_sent_to_review++;
    }
  }
  
  result.module_results.push(moduleResult);
  return moduleResult;
}

function checkForFalseExactMatch(match) {
  const conflicts = match.conflicting_fields || [];
  const criticalConflicts = conflicts.filter(f => 
    ['size', 'units_per_box', 'boxes_per_case', 'grade', 'thickness'].includes(f)
  );
  
  if (criticalConflicts.length > 0) {
    return {
      issue: `False exact match - conflicts in: ${criticalConflicts.join(', ')}`,
      fix: {
        issue: 'exact_match with critical field conflicts',
        fix_applied: 'Downgraded to likely_match or review',
        confidence_after_fix: Math.min(match.match_confidence, 0.75),
        audit_note: `Critical conflicts: ${criticalConflicts.join(', ')}`
      },
      new_result: criticalConflicts.length > 1 ? 'review' : 'likely_match',
      new_confidence: Math.min(match.match_confidence, 0.75)
    };
  }
  
  return null;
}

function auditMatchConfidence(match) {
  const confidence = match.match_confidence || 0;
  const matched = match.matched_fields || [];
  const conflicts = match.conflicting_fields || [];
  
  // Check for overconfidence
  if (confidence > 0.90 && matched.length < 5) {
    return {
      issue: `Confidence ${confidence} not justified by ${matched.length} matched fields`,
      fix: {
        issue: 'Overconfident match score',
        fix_applied: 'Downgraded confidence',
        confidence_after_fix: 0.80,
        audit_note: 'Insufficient matched fields for high confidence'
      },
      new_confidence: 0.80
    };
  }
  
  if (confidence > 0.80 && conflicts.length > 2) {
    return {
      issue: `Confidence ${confidence} despite ${conflicts.length} conflicts`,
      fix: {
        issue: 'Confidence too high given conflicts',
        fix_applied: `Downgraded due to ${conflicts.length} conflicts`,
        confidence_after_fix: 0.65,
        audit_note: `Conflicts: ${conflicts.join(', ')}`
      },
      new_confidence: 0.65
    };
  }
  
  return null;
}

function checkCriticalFieldConflicts(match) {
  const conflicts = match.conflicting_fields || [];
  
  // MPN and UPC conflict is critical
  if (conflicts.includes('manufacturer_part_number') && conflicts.includes('upc')) {
    return 'MPN and UPC both conflict - cannot be same product';
  }
  
  // Pack size with different units is critical
  if (conflicts.includes('units_per_box') && match.match_result === 'exact_match') {
    return 'Pack size differs - cannot be exact match';
  }
  
  // Grade mismatch is critical
  if (conflicts.includes('grade') && match.match_result === 'exact_match') {
    return 'Grade differs (exam vs industrial) - cannot be exact match';
  }
  
  return null;
}

// ==============================================================================
// COMPETITIVE PRICING AUDIT
// ==============================================================================

function auditCompetitivePricing(recommendations, result) {
  const moduleResult = createModuleResult('competitive_pricing');
  
  for (const rec of recommendations) {
    moduleResult.records_checked++;
    result.summary.records_audited++;
    
    const issues = [];
    const fixes = [];
    
    // Margin floor check
    const marginIssue = checkMarginFloor(rec);
    if (marginIssue) {
      issues.push(marginIssue.issue);
      if (marginIssue.block) {
        result.blocked_actions.push({
          record_type: 'pricing',
          record_id: rec.canonical_product_id,
          reason_blocked: marginIssue.issue,
          priority: 'high'
        });
        moduleResult.blocked_items++;
        result.summary.items_blocked++;
        continue;
      }
    }
    
    // MAP check
    if (rec.map_price && rec.recommended_price < rec.map_price) {
      issues.push('Recommended price violates MAP');
      result.blocked_actions.push({
        record_type: 'pricing',
        record_id: rec.canonical_product_id,
        reason_blocked: `Price $${rec.recommended_price} below MAP $${rec.map_price}`,
        priority: 'high'
      });
      moduleResult.blocked_items++;
      result.summary.items_blocked++;
      continue;
    }
    
    // Check competitor offer comparability
    const offerIssues = auditCompetitorOffers(rec);
    issues.push(...offerIssues.issues);
    fixes.push(...offerIssues.fixes);
    
    // Check price swing
    const swingIssue = checkPriceSwing(rec);
    if (swingIssue) {
      issues.push(swingIssue);
      fixes.push({
        issue: swingIssue,
        fix_applied: 'Set auto_publish_eligible=false',
        confidence_after_fix: rec.confidence,
        audit_note: 'Large swing requires human review'
      });
      rec.auto_publish_eligible = false;
    }
    
    // Check data staleness
    const stalenessIssue = checkPricingDataStaleness(rec);
    if (stalenessIssue) {
      issues.push(stalenessIssue);
      rec.confidence = Math.min(rec.confidence || 1.0, 0.70);
    }
    
    // Auto-publish safety check
    if (rec.auto_publish_eligible) {
      const safetyIssue = checkAutoPublishSafety(rec);
      if (safetyIssue) {
        issues.push(safetyIssue);
        fixes.push({
          issue: safetyIssue,
          fix_applied: 'Blocked auto-publish',
          confidence_after_fix: rec.confidence,
          audit_note: 'Safety check failed'
        });
        rec.auto_publish_eligible = false;
      }
    }
    
    // Record results
    moduleResult.issues_found += issues.length;
    result.summary.issues_found += issues.length;
    
    for (const fix of fixes) {
      result.fixes.push({
        record_type: 'pricing',
        record_id: rec.canonical_product_id,
        ...fix
      });
      moduleResult.fixes_applied++;
      result.summary.safe_auto_fixes_applied++;
    }
    
    // Send questionable recommendations to review
    if (issues.length > 0 && !result.blocked_actions.find(b => b.record_id === rec.canonical_product_id)) {
      result.review_queue.push({
        record_type: 'pricing',
        record_id: rec.canonical_product_id,
        issue_category: 'pricing_quality',
        issue_summary: issues.join('; '),
        recommended_action: 'VERIFY - Check pricing data before publishing',
        priority: issues.some(i => i.includes('margin') || i.includes('MAP')) ? 'high' : 'medium'
      });
      moduleResult.review_items_created++;
      result.summary.items_sent_to_review++;
    }
  }
  
  result.module_results.push(moduleResult);
  return moduleResult;
}

function checkMarginFloor(rec) {
  const margin = rec.estimated_margin_percent_after_change;
  
  if (margin !== undefined && margin < QA_CONFIG.min_margin_percent) {
    return {
      issue: `Margin ${Math.round(margin * 100)}% below floor ${Math.round(QA_CONFIG.min_margin_percent * 100)}%`,
      block: true
    };
  }
  
  const marginDollars = rec.estimated_margin_dollars_after_change;
  if (marginDollars !== undefined && marginDollars < QA_CONFIG.min_margin_dollars) {
    return {
      issue: `Margin $${marginDollars.toFixed(2)} below floor $${QA_CONFIG.min_margin_dollars}`,
      block: true
    };
  }
  
  return null;
}

function auditCompetitorOffers(rec) {
  const issues = [];
  const fixes = [];
  const offers = rec.competitor_offers || [];
  
  for (const offer of offers) {
    // Check comparability
    if (offer.same_pack === false) {
      issues.push(`Non-comparable offer from ${offer.source_name}: different pack size`);
    }
    
    // Check shipping
    if (offer.shipping_estimate === undefined && offer.visible_price < rec.current_price * 0.90) {
      issues.push(`Unknown shipping on ${offer.source_name} price - may not be comparable`);
    }
    
    // Check confidence
    if (offer.offer_confidence < 0.70) {
      issues.push(`Low confidence offer from ${offer.source_name} (${Math.round(offer.offer_confidence * 100)}%)`);
    }
  }
  
  if (offers.length === 0) {
    issues.push('No competitor offers - pricing recommendation has no basis');
    fixes.push({
      issue: 'No competitor data',
      fix_applied: 'Set auto_publish_eligible=false',
      confidence_after_fix: 0.50,
      audit_note: 'Cannot price without competitor data'
    });
    rec.auto_publish_eligible = false;
  }
  
  return { issues, fixes };
}

function checkPriceSwing(rec) {
  const current = rec.current_price || 0;
  const recommended = rec.recommended_price || current;
  
  if (current > 0) {
    const swing = Math.abs(recommended - current) / current;
    if (swing > QA_CONFIG.max_price_swing_without_review) {
      return `Price swing ${Math.round(swing * 100)}% exceeds ${Math.round(QA_CONFIG.max_price_swing_without_review * 100)}% threshold`;
    }
  }
  
  return null;
}

function checkPricingDataStaleness(rec) {
  if (rec.last_competitor_update) {
    const age = (Date.now() - new Date(rec.last_competitor_update).getTime()) / (1000 * 60 * 60 * 24);
    if (age > QA_CONFIG.max_competitor_data_age_days) {
      return `Competitor data is ${Math.round(age)} days old`;
    }
  }
  return null;
}

function checkAutoPublishSafety(rec) {
  if ((rec.confidence || 1.0) < QA_CONFIG.min_confidence_auto_publish) {
    return `Confidence ${Math.round(rec.confidence * 100)}% below auto-publish threshold`;
  }
  
  const current = rec.current_price || 0;
  const recommended = rec.recommended_price || current;
  if (current > 0) {
    const change = Math.abs(recommended - current) / current;
    if (change > QA_CONFIG.max_auto_publish_price_change) {
      return `Price change ${Math.round(change * 100)}% exceeds auto-publish limit`;
    }
  }
  
  if (rec.review_reasons && rec.review_reasons.length > 0) {
    return `Has review reasons: ${rec.review_reasons[0]}`;
  }
  
  return null;
}

// ==============================================================================
// DAILY PRICE GUARD AUDIT
// ==============================================================================

function auditDailyPriceGuard(actions, result) {
  const moduleResult = createModuleResult('daily_price_guard');
  const seen = new Map();
  
  for (const action of actions) {
    moduleResult.records_checked++;
    result.summary.records_audited++;
    
    // Check for duplicates
    const key = `${action.product_id}|${action.action_type}`;
    if (seen.has(key)) {
      moduleResult.issues_found++;
      result.summary.issues_found++;
      result.fixes.push({
        record_type: 'action',
        record_id: action.product_id,
        issue: 'Duplicate action in queue',
        fix_applied: 'Merged with existing action',
        confidence_after_fix: 1.0,
        audit_note: 'Safe deduplication'
      });
      moduleResult.fixes_applied++;
      result.summary.safe_auto_fixes_applied++;
      continue;
    }
    seen.set(key, action);
    
    // Check auto_publish safety
    if (action.action_type === 'auto_publish') {
      const safetyIssue = checkActionAutoPublishSafety(action);
      if (safetyIssue) {
        moduleResult.issues_found++;
        result.summary.issues_found++;
        
        result.fixes.push({
          record_type: 'action',
          record_id: action.product_id,
          issue: safetyIssue,
          fix_applied: 'Moved to manual review',
          confidence_after_fix: action.details?.confidence || 0.80,
          audit_note: 'Auto-publish safety check failed'
        });
        action.action_type = 'pricing_review';
        moduleResult.fixes_applied++;
        result.summary.safe_auto_fixes_applied++;
      }
    }
    
    // Check for missing reasons
    if (!action.reason) {
      moduleResult.issues_found++;
      result.summary.issues_found++;
      result.review_queue.push({
        record_type: 'action',
        record_id: action.product_id,
        issue_category: 'data_quality',
        issue_summary: 'Action queued without reason',
        recommended_action: 'INVESTIGATE - Why was this action created?',
        priority: 'low'
      });
      moduleResult.review_items_created++;
      result.summary.items_sent_to_review++;
    }
  }
  
  result.module_results.push(moduleResult);
  return moduleResult;
}

function checkActionAutoPublishSafety(action) {
  const details = action.details || {};
  
  if (details.confidence && details.confidence < QA_CONFIG.min_confidence_auto_publish) {
    return `Confidence ${Math.round(details.confidence * 100)}% too low for auto-publish`;
  }
  
  if (details.review_reasons && details.review_reasons.length > 0) {
    return `Has review reasons: ${details.review_reasons[0]}`;
  }
  
  const current = details.current_price || 0;
  const recommended = details.recommended_price || current;
  if (current > 0) {
    const change = Math.abs(recommended - current) / current;
    if (change > QA_CONFIG.max_auto_publish_price_change) {
      return `Price change ${Math.round(change * 100)}% too large for auto-publish`;
    }
  }
  
  return null;
}

// ==============================================================================
// CROSS-CHECKS
// ==============================================================================

function runCrossChecks(data, result) {
  // Duplicate check across all records
  checkForSystemDuplicates(data, result);
  
  // Identify systemic issues
  identifySystemicIssues(result);
}

function checkForSystemDuplicates(data, result) {
  // Check for duplicate products by MPN
  const mpnSeen = new Map();
  const products = data.products || [];
  
  for (const p of products) {
    if (p.manufacturer_part_number) {
      const mpn = p.manufacturer_part_number.toLowerCase();
      if (mpnSeen.has(mpn)) {
        result.review_queue.push({
          record_type: 'product',
          record_id: p.id || p.sku,
          issue_category: 'duplicate',
          issue_summary: `Duplicate MPN: ${mpn} (also on ${mpnSeen.get(mpn)})`,
          recommended_action: 'MERGE - Keep canonical version',
          priority: 'high'
        });
        result.summary.items_sent_to_review++;
        result.summary.issues_found++;
      } else {
        mpnSeen.set(mpn, p.id || p.sku);
      }
    }
  }
}

function identifySystemicIssues(result) {
  // Analyze patterns in issues
  const issuePatterns = {};
  
  for (const item of result.review_queue) {
    const category = item.issue_category;
    issuePatterns[category] = (issuePatterns[category] || 0) + 1;
  }
  
  for (const fix of result.fixes) {
    const issue = fix.issue || '';
    if (issue.includes('confidence')) {
      issuePatterns['confidence_inflation'] = (issuePatterns['confidence_inflation'] || 0) + 1;
    }
    if (issue.includes('missing') || issue.includes('Missing')) {
      issuePatterns['missing_data'] = (issuePatterns['missing_data'] || 0) + 1;
    }
  }
  
  // Flag systemic issues
  for (const [pattern, count] of Object.entries(issuePatterns)) {
    if (count >= 5) {
      result.systemic_issues.push({
        issue: `Recurring ${pattern} issue (${count} occurrences)`,
        impact: 'Degraded data quality across multiple records',
        recommended_fix: getSystemicFixRecommendation(pattern)
      });
      result.summary.systemic_issues_found++;
    }
  }
}

function getSystemicFixRecommendation(pattern) {
  const recommendations = {
    'confidence_inflation': 'Review confidence scoring algorithm - thresholds may be too loose',
    'missing_data': 'Require mandatory fields in intake pipeline - reject incomplete records',
    'ambiguous_match': 'Tighten matching thresholds or add more distinguishing fields',
    'catalog_quality': 'Improve supplier data requirements before accepting feeds',
    'pricing_quality': 'Increase competitor data validation before pricing decisions',
    'duplicate': 'Add pre-intake duplicate detection step'
  };
  return recommendations[pattern] || 'Investigate root cause and add validation';
}

// ==============================================================================
// SELF-AUDIT
// ==============================================================================

function performSelfAudit(result) {
  const selfAudit = {
    guessed_anywhere: false,
    allowed_unsafe_automation: false,
    missed_confidence_downgrade: false,
    missed_duplicate_risk: false,
    missed_systemic_pattern: false,
    validation_notes: []
  };
  
  // Check for guessing in fixes
  for (const fix of result.fixes) {
    if (fix.audit_note && (fix.audit_note.includes('assumed') || fix.audit_note.includes('guessed'))) {
      selfAudit.guessed_anywhere = true;
      selfAudit.validation_notes.push(`Potential guess in fix: ${fix.issue}`);
    }
  }
  
  // Check blocked actions are justified
  for (const blocked of result.blocked_actions) {
    if (!blocked.reason_blocked) {
      selfAudit.validation_notes.push(`Blocked action without reason: ${blocked.record_id}`);
    }
  }
  
  // Check auto-publish items in review queue
  for (const item of result.review_queue) {
    if (item.issue_summary && item.issue_summary.includes('auto_publish')) {
      selfAudit.allowed_unsafe_automation = true;
      selfAudit.validation_notes.push(`Auto-publish item ended up in review: ${item.record_id}`);
    }
  }
  
  // Check if we should have found more systemic issues
  if (result.review_queue.length > 20 && result.systemic_issues.length === 0) {
    selfAudit.missed_systemic_pattern = true;
    selfAudit.validation_notes.push('Large review queue with no systemic issues identified - investigate');
  }
  
  // Final validation
  selfAudit.passed = !selfAudit.guessed_anywhere && 
                     !selfAudit.allowed_unsafe_automation &&
                     selfAudit.validation_notes.length < 3;
  
  result.self_audit = selfAudit;
  return selfAudit;
}

// ==============================================================================
// MAIN AUDIT FUNCTION
// ==============================================================================

function runFullAudit(data) {
  const result = createAuditResult();
  
  // Audit each module
  if (data.suppliers && data.suppliers.length > 0) {
    auditSupplierDiscovery(data.suppliers, result);
  }
  
  if (data.products && data.products.length > 0) {
    auditProductIntake(data.products, result);
  }
  
  if (data.matches && data.matches.length > 0) {
    auditProductMatching(data.matches, result);
  }
  
  if (data.pricing && data.pricing.length > 0) {
    auditCompetitivePricing(data.pricing, result);
  }
  
  if (data.actions && data.actions.length > 0) {
    auditDailyPriceGuard(data.actions, result);
  }
  
  // Cross-checks
  runCrossChecks(data, result);
  
  // Self-audit
  performSelfAudit(result);
  
  // Generate next steps
  result.next_steps = generateNextSteps(result);
  
  return result;
}

function generateNextSteps(result) {
  const steps = [];
  
  if (result.blocked_actions.length > 0) {
    steps.push(`Review ${result.blocked_actions.length} blocked actions immediately`);
  }
  
  const highPriority = result.review_queue.filter(r => r.priority === 'high');
  if (highPriority.length > 0) {
    steps.push(`Address ${highPriority.length} high-priority review items`);
  }
  
  if (result.systemic_issues.length > 0) {
    steps.push(`Investigate ${result.systemic_issues.length} systemic issues`);
  }
  
  if (result.summary.safe_auto_fixes_applied > 0) {
    steps.push(`${result.summary.safe_auto_fixes_applied} auto-fixes applied - verify in system`);
  }
  
  if (steps.length === 0) {
    steps.push('All checks passed - no immediate action required');
  }
  
  return steps;
}

// ==============================================================================
// EXPORTS
// ==============================================================================

module.exports = {
  runFullAudit,
  auditSupplierDiscovery,
  auditProductIntake,
  auditProductMatching,
  auditCompetitivePricing,
  auditDailyPriceGuard,
  performSelfAudit,
  QA_CONFIG
};
