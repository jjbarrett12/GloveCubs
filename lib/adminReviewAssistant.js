/**
 * GloveCubs Admin Review Assistant
 * 
 * Reviews flagged supplier, catalog, and pricing items.
 * Produces clear explanations and recommended actions.
 */

// ==============================================================================
// ISSUE ANALYZERS
// ==============================================================================

const ISSUE_ANALYZERS = {
  
  // ---------------------------------------------------------------------------
  // SUPPLIER ISSUES
  // ---------------------------------------------------------------------------
  
  supplier_legitimacy: {
    category: 'Supplier',
    severity: 'high',
    analyze: (item) => ({
      issue: 'Supplier legitimacy concern',
      why_it_matters: 'Unreliable suppliers cause stockouts, quality issues, and customer complaints. Bad supplier data contaminates the catalog.',
      likely_cause: detectSupplierCause(item),
      recommended_action: 'HOLD - Do not onboard until verified',
      verify_before_approval: [
        'Confirm business registration/license',
        'Check industry references',
        'Request sample order',
        'Verify return policy and lead times',
        'Confirm they are an authorized distributor'
      ]
    })
  },

  cost_increase: {
    category: 'Supplier',
    severity: 'high',
    analyze: (item) => {
      const pct = item.details?.change_percent || 0;
      return {
        issue: `Supplier cost increased ${pct}%`,
        why_it_matters: 'Cost increase erodes margin. May require price adjustment or supplier renegotiation.',
        likely_cause: 'Supplier raised wholesale price. Could be material costs, shipping, or demand.',
        recommended_action: pct > 10 
          ? 'REVIEW PRICING - Margin may be unsustainable'
          : 'ACKNOWLEDGE - Update cost in system, consider price adjustment',
        verify_before_approval: [
          'Confirm cost increase is real (not data error)',
          'Check if other suppliers offer better pricing',
          'Calculate new margin at current selling price',
          'Decide whether to absorb or pass to customer'
        ]
      };
    }
  },

  cost_decrease: {
    category: 'Supplier',
    severity: 'low',
    analyze: (item) => {
      const pct = item.details?.change_percent || 0;
      return {
        issue: `Supplier cost decreased ${pct}%`,
        why_it_matters: 'Opportunity to improve margin or become more competitive.',
        likely_cause: 'Supplier promotion, volume discount, or market adjustment.',
        recommended_action: 'APPROVE - Update cost, consider competitive price reduction',
        verify_before_approval: [
          'Confirm this is ongoing (not one-time promo)',
          'Update cost in system',
          'Decide whether to lower price or take margin'
        ]
      };
    }
  },

  stale_cost: {
    category: 'Supplier',
    severity: 'medium',
    analyze: (item) => ({
      issue: `Cost data is ${item.details?.days || '30+'} days old`,
      why_it_matters: 'Stale costs lead to incorrect margin calculations. You may be losing money without knowing.',
      likely_cause: 'Supplier feed not updated, or manual entry neglected.',
      recommended_action: 'REQUEST UPDATE - Contact supplier for current pricing',
      verify_before_approval: [
        'Request current price sheet from supplier',
        'Update cost in system',
        'Flag if cost changed significantly'
      ]
    })
  },

  missing_moq: {
    category: 'Supplier',
    severity: 'medium',
    analyze: (item) => ({
      issue: 'Missing minimum order quantity (MOQ)',
      why_it_matters: 'Without MOQ, you may accept orders you cannot fulfill economically.',
      likely_cause: 'Incomplete supplier data entry or missing from feed.',
      recommended_action: 'HOLD - Request MOQ from supplier before listing',
      verify_before_approval: [
        'Contact supplier for MOQ',
        'Confirm MOQ is per-SKU or per-order',
        'Update product record',
        'Set reorder alerts accordingly'
      ]
    })
  },

  // ---------------------------------------------------------------------------
  // CATALOG ISSUES
  // ---------------------------------------------------------------------------

  duplicate_product: {
    category: 'Catalog',
    severity: 'high',
    analyze: (item) => ({
      issue: 'Suspected duplicate product in catalog',
      why_it_matters: 'Duplicates confuse customers, split sales data, and waste ad spend. Clean catalog = better business.',
      likely_cause: detectDuplicateCause(item),
      recommended_action: 'MERGE or DELETE - Keep canonical version only',
      verify_before_approval: [
        'Compare both product records side by side',
        'Confirm same brand, material, size, pack quantity',
        'Check if one has better images/description',
        'Redirect old SKU to canonical SKU',
        'Preserve order history linkage'
      ]
    })
  },

  near_duplicate: {
    category: 'Catalog',
    severity: 'medium',
    analyze: (item) => ({
      issue: 'Near-duplicate or possible variant detected',
      why_it_matters: 'May be the same product with slight data differences, or a legitimate variant. Wrong choice pollutes catalog.',
      likely_cause: 'Different supplier feeds for same product, or actual variant (color/size).',
      recommended_action: 'INVESTIGATE - Determine if variant or duplicate',
      verify_before_approval: [
        'Compare MPN/UPC if available',
        'Check brand, material, thickness, size, pack qty',
        'If same product: merge',
        'If true variant: link as variant of parent',
        'If different product: approve as new'
      ]
    })
  },

  conflicting_attributes: {
    category: 'Catalog',
    severity: 'high',
    analyze: (item) => ({
      issue: 'Conflicting glove attributes detected',
      why_it_matters: 'Incorrect attributes cause customer returns and compliance issues. Medical vs industrial grade matters.',
      likely_cause: detectAttributeConflictCause(item),
      recommended_action: 'VERIFY SOURCE - Check manufacturer spec sheet',
      verify_before_approval: [
        'Pull manufacturer product data sheet',
        'Confirm: material, thickness, grade, compliance',
        'Correct the conflicting field',
        'If unclear, contact manufacturer or supplier'
      ]
    })
  },

  missing_case_pack: {
    category: 'Catalog',
    severity: 'medium',
    analyze: (item) => ({
      issue: 'Missing case pack or box quantity',
      why_it_matters: 'Customers expect to know what they are buying. Shipping costs depend on accurate pack data.',
      likely_cause: 'Incomplete product data from supplier or manual entry.',
      recommended_action: 'HOLD - Add pack quantity before publishing',
      verify_before_approval: [
        'Find units per box and boxes per case',
        'Calculate total units per case',
        'Update product record',
        'Verify pricing is per-box or per-case'
      ]
    })
  },

  low_confidence_parse: {
    category: 'Catalog',
    severity: 'medium',
    analyze: (item) => {
      const confidence = item.context?.parse_confidence || item.data?.parse_confidence || 0;
      return {
        issue: `Low parse confidence (${Math.round(confidence * 100)}%)`,
        why_it_matters: 'Automated parsing may have misread product data. Publishing bad data damages customer trust.',
        likely_cause: 'Messy source data, unusual formatting, or missing fields.',
        recommended_action: 'MANUAL REVIEW - Verify all extracted fields',
        verify_before_approval: [
          'Check extracted title against source',
          'Verify material, size, thickness, pack qty',
          'Correct any misread values',
          'If too messy, request clean data from supplier'
        ]
      };
    }
  },

  ambiguous_match: {
    category: 'Catalog',
    severity: 'medium',
    analyze: (item) => {
      const confidence = item.context?.bestMatch?.confidence || 0;
      return {
        issue: `Ambiguous product match (${Math.round(confidence * 100)}% confidence)`,
        why_it_matters: 'May incorrectly link to wrong canonical product, corrupting inventory and pricing.',
        likely_cause: 'Similar products exist in catalog. Matching algorithm cannot decide.',
        recommended_action: 'MANUAL MATCH - Admin must choose correct canonical',
        verify_before_approval: [
          'Compare incoming product to suggested match',
          'Check MPN, UPC, brand, attributes',
          'If match: link to existing',
          'If different: create new canonical',
          'If variant: create as variant'
        ]
      };
    }
  },

  // ---------------------------------------------------------------------------
  // PRICING ISSUES
  // ---------------------------------------------------------------------------

  major_price_swing: {
    category: 'Pricing',
    severity: 'high',
    analyze: (item) => {
      const current = item.data?.current_price || item.details?.current_price || 0;
      const recommended = item.data?.recommended_price || item.details?.recommended_price || 0;
      const pct = current > 0 ? Math.round(Math.abs(recommended - current) / current * 100) : 0;
      const direction = recommended > current ? 'increase' : 'decrease';
      
      return {
        issue: `Large price ${direction} recommended (${pct}%)`,
        why_it_matters: direction === 'increase' 
          ? 'Price increase may hurt sales velocity. Customers notice big jumps.'
          : 'Price decrease may trigger price war or indicate margin problem.',
        likely_cause: direction === 'increase'
          ? 'Competitors raised prices or your cost increased.'
          : 'Competitors lowered prices or you were overpriced.',
        recommended_action: 'REVIEW CAREFULLY - Confirm change makes business sense',
        verify_before_approval: [
          'Check competitor prices are accurate and comparable',
          'Calculate margin at new price',
          'Consider customer impact',
          direction === 'increase' ? 'Test with small rollout if uncertain' : 'Verify not racing to bottom',
          'Approve only if confident'
        ]
      };
    }
  },

  low_margin_risk: {
    category: 'Pricing',
    severity: 'high',
    analyze: (item) => {
      const margin = item.data?.estimated_margin_percent_after_change || 
                     item.context?.estimated_margin_percent_after_change || 0;
      return {
        issue: `Low margin risk (${Math.round(margin * 100)}% projected)`,
        why_it_matters: 'Thin margins leave no room for shipping errors, returns, or cost increases. Unsustainable.',
        likely_cause: 'Competitive pressure, cost increase, or aggressive pricing.',
        recommended_action: 'REJECT or RAISE FLOOR - Do not approve unsustainable pricing',
        verify_before_approval: [
          'Confirm cost is current',
          'Check if volume justifies thin margin',
          'Consider dropping product if unprofitable',
          'Do not approve below 15% margin without VP sign-off'
        ]
      };
    }
  },

  map_conflict: {
    category: 'Pricing',
    severity: 'critical',
    analyze: (item) => ({
      issue: 'Potential MAP (Minimum Advertised Price) violation',
      why_it_matters: 'MAP violations can result in losing supplier authorization, legal action, or damaged relationships.',
      likely_cause: 'Recommended price is below manufacturer MAP floor.',
      recommended_action: 'BLOCK - Do not publish below MAP',
      verify_before_approval: [
        'Confirm MAP price with manufacturer',
        'Ensure published price meets or exceeds MAP',
        'If MAP changed, update system',
        'If intentional violation, escalate to legal/leadership'
      ]
    })
  },

  suspicious_competitor_price: {
    category: 'Pricing',
    severity: 'medium',
    analyze: (item) => ({
      issue: 'Suspicious competitor pricing detected',
      why_it_matters: 'Bad competitor data leads to bad decisions. Do not chase fake prices.',
      likely_cause: detectSuspiciousPriceCause(item),
      recommended_action: 'IGNORE OFFER - Do not adjust based on this data',
      verify_before_approval: [
        'Manually check competitor listing',
        'Confirm price is real and in-stock',
        'Verify same product (not different pack size)',
        'If valid, update confidence; if fake, blacklist source'
      ]
    })
  },

  stale_pricing_data: {
    category: 'Pricing',
    severity: 'medium',
    analyze: (item) => ({
      issue: `Competitor pricing data is ${item.details?.days || '7+'} days old`,
      why_it_matters: 'Stale data leads to wrong decisions. Market moves faster than your data.',
      likely_cause: 'Competitor monitoring not running or source blocked.',
      recommended_action: 'REFRESH DATA - Get current competitor prices before deciding',
      verify_before_approval: [
        'Manually check current competitor prices',
        'Update competitor monitoring if broken',
        'Do not make price changes on stale data'
      ]
    })
  },

  underpriced: {
    category: 'Pricing',
    severity: 'medium',
    analyze: (item) => {
      const current = item.data?.current_price || 0;
      const lowest = item.data?.lowest_trusted_comparable_price || 
                     item.context?.lowest_trusted_comparable_price || 0;
      const gap = lowest > 0 ? Math.round((lowest - current) / current * 100) : 0;
      
      return {
        issue: `Product underpriced by ${gap}% vs competitors`,
        why_it_matters: 'Leaving money on the table. Could increase margin without losing sales.',
        likely_cause: 'Competitors raised prices, or original pricing was too conservative.',
        recommended_action: 'RAISE PRICE - Capture additional margin',
        verify_before_approval: [
          'Confirm competitor prices are current',
          'Calculate new margin at higher price',
          'Consider gradual increase vs one jump',
          'Approve price increase'
        ]
      };
    }
  }
};

// ==============================================================================
// CAUSE DETECTION HELPERS
// ==============================================================================

function detectSupplierCause(item) {
  const data = item.data || item;
  const reasons = [];
  
  if (!data.business_license) reasons.push('No business license on file');
  if (!data.website || data.website.includes('gmail') || data.website.includes('yahoo')) {
    reasons.push('No professional website');
  }
  if (data.lead_time_days > 14) reasons.push('Unusually long lead times');
  if (data.minimum_order > 10000) reasons.push('Very high minimum order');
  if (!data.return_policy) reasons.push('No return policy stated');
  
  return reasons.length > 0 ? reasons.join('. ') : 'New supplier with insufficient verification history.';
}

function detectDuplicateCause(item) {
  const data = item.data || item.context || {};
  
  if (data.matched_fields?.includes('upc')) {
    return 'Same UPC found on multiple records.';
  }
  if (data.matched_fields?.includes('manufacturer_part_number')) {
    return 'Same manufacturer part number on multiple records.';
  }
  if (data.conflicting_fields?.length > 0) {
    return `Same core product but conflicting: ${data.conflicting_fields.join(', ')}`;
  }
  
  return 'Multiple supplier feeds submitted same product with slight variations.';
}

function detectAttributeConflictCause(item) {
  const conflicts = item.data?.conflicting_fields || item.context?.conflicting_fields || [];
  
  if (conflicts.includes('grade')) {
    return 'Exam grade vs industrial grade mismatch. Check manufacturer spec.';
  }
  if (conflicts.includes('thickness')) {
    return 'Thickness values do not match. Verify with spec sheet.';
  }
  if (conflicts.includes('material')) {
    return 'Material type conflict (e.g., nitrile vs vinyl). Critical error.';
  }
  if (conflicts.includes('units_per_box')) {
    return 'Box count does not match. May be comparing different pack sizes.';
  }
  
  return 'Source data contains conflicting product specifications.';
}

function detectSuspiciousPriceCause(item) {
  const offers = item.data?.competitor_offers || [];
  const reasons = [];
  
  for (const offer of offers) {
    if (offer.offer_confidence < 0.7) {
      reasons.push(`Low confidence offer from ${offer.source_name}`);
    }
    if (offer.availability === 'out_of_stock') {
      reasons.push(`${offer.source_name} price is for out-of-stock item`);
    }
    if (!offer.same_pack) {
      reasons.push(`${offer.source_name} may be different pack size`);
    }
  }
  
  return reasons.length > 0 ? reasons.join('. ') : 'Price seems too low to be legitimate.';
}

// ==============================================================================
// REVIEW ITEM PROCESSOR
// ==============================================================================

function analyzeReviewItem(item) {
  // Determine issue type
  let issueType = item.type || item.escalation_reason || 'unknown';
  
  // Map common patterns to issue types
  if (issueType.includes('cost_increase') || item.data?.type === 'cost_increase') {
    issueType = 'cost_increase';
  } else if (issueType.includes('cost_decrease') || item.data?.type === 'cost_decrease') {
    issueType = 'cost_decrease';
  } else if (issueType.includes('stale_cost') || item.data?.type === 'stale_cost') {
    issueType = 'stale_cost';
  } else if (issueType.includes('duplicate') || issueType.includes('Duplicate')) {
    issueType = 'duplicate_product';
  } else if (issueType.includes('ambiguous') || issueType.includes('Ambiguous')) {
    issueType = 'ambiguous_match';
  } else if (issueType.includes('confidence') || issueType.includes('Confidence')) {
    issueType = 'low_confidence_parse';
  } else if (issueType.includes('margin') || issueType.includes('Margin')) {
    issueType = 'low_margin_risk';
  } else if (issueType.includes('MAP') || issueType.includes('map')) {
    issueType = 'map_conflict';
  } else if (issueType.includes('swing') || issueType.includes('exceeds')) {
    issueType = 'major_price_swing';
  } else if (issueType.includes('underpriced') || issueType.includes('below competitors')) {
    issueType = 'underpriced';
  } else if (issueType.includes('stale') && issueType.includes('pricing')) {
    issueType = 'stale_pricing_data';
  } else if (issueType.includes('supplier') && issueType.includes('review')) {
    issueType = 'cost_increase'; // Default for supplier review
  }
  
  // Get analyzer
  const analyzer = ISSUE_ANALYZERS[issueType];
  
  if (!analyzer) {
    return {
      issue_type: issueType,
      category: 'Unknown',
      severity: 'medium',
      issue: item.escalation_reason || item.reason || 'Item flagged for review',
      why_it_matters: 'Unknown issue type. Manual investigation required.',
      likely_cause: 'Could not determine cause automatically.',
      recommended_action: 'INVESTIGATE - Review item details manually',
      verify_before_approval: ['Review all item data', 'Determine appropriate action'],
      raw_data: item.data
    };
  }
  
  const analysis = analyzer.analyze(item);
  
  return {
    issue_type: issueType,
    category: analyzer.category,
    severity: analyzer.severity,
    ...analysis,
    raw_data: item.data
  };
}

function processReviewQueue(items) {
  const results = {
    total: items.length,
    by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
    by_category: { Supplier: 0, Catalog: 0, Pricing: 0, Unknown: 0 },
    items: []
  };
  
  for (const item of items) {
    const analysis = analyzeReviewItem(item);
    
    results.by_severity[analysis.severity] = (results.by_severity[analysis.severity] || 0) + 1;
    results.by_category[analysis.category] = (results.by_category[analysis.category] || 0) + 1;
    
    results.items.push({
      id: item.id,
      queue: item.queue,
      priority: item.priority,
      sku: item.data?.sku || item.data?.product_id,
      title: item.data?.title || item.data?.name,
      ...analysis
    });
  }
  
  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  results.items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  
  return results;
}

// ==============================================================================
// REPORT GENERATION
// ==============================================================================

function generateReviewReport(results) {
  let report = '';
  
  report += '\n' + '═'.repeat(70) + '\n';
  report += '     ADMIN REVIEW QUEUE\n';
  report += '═'.repeat(70) + '\n\n';
  
  // Summary
  report += `Total Items: ${results.total}\n`;
  report += `Critical: ${results.by_severity.critical || 0} | `;
  report += `High: ${results.by_severity.high || 0} | `;
  report += `Medium: ${results.by_severity.medium || 0} | `;
  report += `Low: ${results.by_severity.low || 0}\n\n`;
  
  if (results.total === 0) {
    report += '✅ Review queue is empty. All clear.\n';
    report += '\n' + '═'.repeat(70) + '\n';
    return report;
  }
  
  // Items
  for (const item of results.items) {
    const severityIcon = item.severity === 'critical' ? '🔴' 
      : item.severity === 'high' ? '🟠'
      : item.severity === 'medium' ? '🟡' : '🟢';
    
    report += '-'.repeat(70) + '\n';
    report += `${severityIcon} [${item.severity.toUpperCase()}] ${item.category}\n`;
    report += `   SKU: ${item.sku || 'N/A'}\n`;
    report += `   ${item.title || ''}\n\n`;
    
    report += `   ISSUE: ${item.issue}\n\n`;
    
    report += `   WHY IT MATTERS:\n`;
    report += `   ${item.why_it_matters}\n\n`;
    
    report += `   LIKELY CAUSE:\n`;
    report += `   ${item.likely_cause}\n\n`;
    
    report += `   RECOMMENDED ACTION:\n`;
    report += `   → ${item.recommended_action}\n\n`;
    
    report += `   VERIFY BEFORE APPROVAL:\n`;
    item.verify_before_approval.forEach(step => {
      report += `   ☐ ${step}\n`;
    });
    
    report += '\n';
  }
  
  report += '═'.repeat(70) + '\n';
  
  return report;
}

function generateCompactReport(results) {
  let report = '';
  
  report += '\nREVIEW QUEUE SUMMARY\n';
  report += '═'.repeat(50) + '\n';
  report += `Total: ${results.total} | `;
  report += `🔴 ${results.by_severity.critical || 0} | `;
  report += `🟠 ${results.by_severity.high || 0} | `;
  report += `🟡 ${results.by_severity.medium || 0} | `;
  report += `🟢 ${results.by_severity.low || 0}\n\n`;
  
  if (results.total === 0) {
    report += '✅ Queue clear\n';
    return report;
  }
  
  for (const item of results.items) {
    const icon = item.severity === 'critical' ? '🔴' 
      : item.severity === 'high' ? '🟠'
      : item.severity === 'medium' ? '🟡' : '🟢';
    
    report += `${icon} ${item.sku || 'N/A'}: ${item.issue}\n`;
    report += `   → ${item.recommended_action}\n\n`;
  }
  
  return report;
}

// ==============================================================================
// EXPORTS
// ==============================================================================

module.exports = {
  analyzeReviewItem,
  processReviewQueue,
  generateReviewReport,
  generateCompactReport,
  ISSUE_ANALYZERS
};
