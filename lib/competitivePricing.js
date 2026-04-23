/**
 * GloveCubs Competitive Pricing Agent
 * 
 * Monitors competitor pricing and generates intelligent pricing recommendations
 * while maintaining healthy margins and avoiding race-to-bottom pricing.
 */

// ==============================================================================
// PRICING CONSTANTS
// ==============================================================================

const DEFAULT_CONFIG = {
  minimum_margin_percent: 0.22,        // 22% minimum margin
  minimum_margin_dollars: 1.50,        // $1.50 minimum dollar margin
  map_violation_allowed: false,        // Never violate MAP
  max_price_decrease_percent: 0.15,    // Max 15% decrease in one adjustment
  max_price_increase_percent: 0.10,    // Max 10% increase in one adjustment
  price_swing_review_threshold: 0.07,  // 7%+ swing triggers review
  undercut_tolerance: 0.03,            // Within 3% = don't race down
  overpriced_threshold: 0.15,          // 15%+ over competitors = raise flag
  suspicious_low_price_percent: 0.40,  // 40%+ below cost = suspicious
  min_offer_confidence: 0.70,          // Minimum confidence to consider offer
  stale_offer_days: 14,                // Offers older than 14 days are stale
  auto_publish_confidence: 0.85        // Min confidence for auto-publish
};

// Trusted competitor sources (higher weight)
const TRUSTED_SOURCES = [
  'amazon.com',
  'uline.com',
  'grainger.com',
  'mcmaster.com',
  'globalindustrial.com',
  'fastenal.com',
  'zoro.com',
  'webstaurantstore.com',
  'restaurantsupply.com',
  'medline.com'
];

// Sources known for inconsistent data
const UNTRUSTED_SOURCES = [
  'ebay.com',
  'alibaba.com',
  'wish.com',
  'temu.com'
];

// ==============================================================================
// OFFER VALIDATION
// ==============================================================================

function validateOffer(offer, product, config = DEFAULT_CONFIG) {
  const issues = [];
  let confidence = offer.offer_confidence || 0.5;
  
  // Source trust check
  const sourceLower = (offer.source_name || '').toLowerCase();
  if (UNTRUSTED_SOURCES.some(s => sourceLower.includes(s))) {
    issues.push('Untrusted source');
    confidence *= 0.3;
  } else if (TRUSTED_SOURCES.some(s => sourceLower.includes(s))) {
    confidence *= 1.1; // Slight boost for trusted
  }
  
  // Pack comparability
  if (!offer.same_pack) {
    issues.push('Pack size mismatch');
    confidence *= 0.4;
  }
  
  // Brand comparability
  if (offer.same_brand === false) {
    issues.push('Different brand');
    confidence *= 0.7;
  }
  
  // Price sanity checks
  if (offer.visible_price <= 0) {
    issues.push('Invalid price');
    confidence = 0;
  }
  
  // Suspiciously low price
  if (product.current_cost && offer.visible_price < product.current_cost * (1 - config.suspicious_low_price_percent)) {
    issues.push('Suspiciously low price - may be error or scam');
    confidence *= 0.3;
  }
  
  // Availability check
  if (offer.availability === 'out_of_stock' || offer.availability === 'discontinued') {
    issues.push('Not available');
    confidence *= 0.2;
  }
  
  // Shipping unknown
  if (offer.shipping_estimate === null || offer.shipping_estimate === undefined) {
    issues.push('Unknown shipping cost');
    confidence *= 0.8;
  }
  
  // Cap confidence at 1.0
  confidence = Math.min(1.0, Math.max(0, confidence));
  
  return {
    valid: confidence >= config.min_offer_confidence && issues.length < 3,
    confidence: Math.round(confidence * 100) / 100,
    issues
  };
}

function calculateEffectivePrice(offer) {
  const price = offer.visible_price || 0;
  const shipping = offer.shipping_estimate || 0;
  return price + shipping;
}

// ==============================================================================
// PRICING CALCULATIONS
// ==============================================================================

function calculateMargin(price, cost) {
  if (!price || !cost || price <= 0) return { percent: 0, dollars: 0 };
  const dollars = price - cost;
  const percent = dollars / price;
  return {
    percent: Math.round(percent * 1000) / 1000,
    dollars: Math.round(dollars * 100) / 100
  };
}

function meetsMarginFloor(price, cost, config = DEFAULT_CONFIG) {
  const margin = calculateMargin(price, cost);
  return margin.percent >= config.minimum_margin_percent && 
         margin.dollars >= config.minimum_margin_dollars;
}

function calculateMinimumPrice(cost, config = DEFAULT_CONFIG) {
  // Price needed to meet margin requirements
  const fromPercent = cost / (1 - config.minimum_margin_percent);
  const fromDollars = cost + config.minimum_margin_dollars;
  return Math.max(fromPercent, fromDollars);
}

function normalizeOffers(offers, product, config = DEFAULT_CONFIG) {
  return offers
    .map(offer => {
      const validation = validateOffer(offer, product, config);
      return {
        ...offer,
        effective_price: calculateEffectivePrice(offer),
        validation,
        weighted_price: validation.valid 
          ? calculateEffectivePrice(offer) * (2 - validation.confidence)
          : Infinity
      };
    })
    .filter(o => o.validation.valid)
    .sort((a, b) => a.effective_price - b.effective_price);
}

// ==============================================================================
// PRICING RECOMMENDATIONS
// ==============================================================================

function generateRecommendation(product, config = DEFAULT_CONFIG) {
  const reviewReasons = [];
  let confidence = 1.0;
  
  // Validate input
  if (!product.canonical_product_id) {
    return {
      canonical_product_id: null,
      action: 'review',
      reason: 'Missing product ID',
      confidence: 0,
      auto_publish_eligible: false,
      review_reasons: ['Missing product ID']
    };
  }
  
  const currentPrice = product.current_price || 0;
  const currentCost = product.current_cost || 0;
  const mapPrice = product.map_price || 0;
  const shippingCost = product.shipping_cost_estimate || 0;
  
  // Effective cost includes shipping
  const effectiveCost = currentCost + shippingCost;
  
  // Calculate current margin
  const currentMargin = calculateMargin(currentPrice, effectiveCost);
  
  // Minimum acceptable price
  const minPrice = Math.max(
    calculateMinimumPrice(effectiveCost, config),
    mapPrice || 0
  );
  
  // Normalize and filter competitor offers
  const validOffers = normalizeOffers(product.competitor_offers || [], product, config);
  
  // No valid competitor data
  if (validOffers.length === 0) {
    return {
      canonical_product_id: product.canonical_product_id,
      current_price: currentPrice,
      recommended_price: currentPrice,
      action: 'keep',
      reason: 'No valid competitor offers to compare',
      lowest_trusted_comparable_price: null,
      estimated_margin_percent_after_change: currentMargin.percent,
      estimated_margin_dollars_after_change: currentMargin.dollars,
      confidence: 0.5,
      auto_publish_eligible: false,
      review_reasons: ['No competitor data']
    };
  }
  
  // Find lowest trusted comparable price
  const lowestOffer = validOffers[0];
  const lowestPrice = lowestOffer.effective_price;
  
  // Reduce confidence based on offer quality
  confidence *= lowestOffer.validation.confidence;
  
  // Calculate price difference
  const priceDiff = currentPrice - lowestPrice;
  const priceDiffPercent = currentPrice > 0 ? priceDiff / currentPrice : 0;
  
  let recommendedPrice = currentPrice;
  let action = 'keep';
  let reason = '';
  
  // ==== PRICING LOGIC ====
  
  // Case 1: We're significantly overpriced
  if (priceDiffPercent > config.overpriced_threshold) {
    // We're way above competitors - consider lowering
    const targetPrice = Math.max(minPrice, lowestPrice * 1.02); // Slightly above lowest
    
    // Don't drop more than max decrease in one adjustment
    const maxDecrease = currentPrice * (1 - config.max_price_decrease_percent);
    recommendedPrice = Math.max(targetPrice, maxDecrease, minPrice);
    
    if (recommendedPrice < currentPrice) {
      action = 'lower';
      reason = `Currently ${Math.round(priceDiffPercent * 100)}% above competitors`;
      
      if (recommendedPrice < currentPrice * 0.93) {
        reviewReasons.push('Large price decrease recommended');
      }
    } else {
      action = 'review';
      reason = 'Cannot lower to competitive price while maintaining margin';
      reviewReasons.push('Margin constraint prevents competitive pricing');
    }
  }
  
  // Case 2: We're competitively priced (within tolerance)
  else if (Math.abs(priceDiffPercent) <= config.undercut_tolerance) {
    action = 'keep';
    reason = 'Price is competitive - within tolerance of market';
    recommendedPrice = currentPrice;
  }
  
  // Case 3: We're slightly below competitors (good position)
  else if (priceDiff < 0 && Math.abs(priceDiffPercent) <= config.overpriced_threshold) {
    // We're cheaper than competitors - might be able to raise
    const currentMarginOK = meetsMarginFloor(currentPrice, effectiveCost, config);
    
    if (!currentMarginOK) {
      // Margin is thin - raise to improve
      const targetPrice = Math.min(
        lowestPrice * 0.98, // Stay just below competitor
        currentPrice * (1 + config.max_price_increase_percent)
      );
      recommendedPrice = Math.max(targetPrice, minPrice);
      action = recommendedPrice > currentPrice ? 'raise' : 'keep';
      reason = 'Raising price to improve thin margin while staying competitive';
    } else {
      // Good position - keep the competitive advantage
      action = 'keep';
      reason = 'Already priced below competition with healthy margin';
    }
  }
  
  // Case 4: We're significantly underpriced
  else if (priceDiff < 0 && Math.abs(priceDiffPercent) > config.overpriced_threshold) {
    // We might be leaving money on table
    const targetPrice = Math.min(
      lowestPrice * 0.98,
      currentPrice * (1 + config.max_price_increase_percent)
    );
    
    if (targetPrice > currentPrice) {
      action = 'raise';
      reason = `Priced ${Math.round(Math.abs(priceDiffPercent) * 100)}% below competitors - opportunity to improve margin`;
      recommendedPrice = targetPrice;
    } else {
      action = 'keep';
      reason = 'Competitive pricing maintained';
    }
  }
  
  // ==== VALIDATION CHECKS ====
  
  // MAP violation check
  if (mapPrice > 0 && recommendedPrice < mapPrice) {
    recommendedPrice = mapPrice;
    reason = 'Price adjusted to MAP minimum';
    reviewReasons.push('MAP constraint applied');
  }
  
  // Margin floor check
  const newMargin = calculateMargin(recommendedPrice, effectiveCost);
  if (!meetsMarginFloor(recommendedPrice, effectiveCost, config)) {
    recommendedPrice = minPrice;
    action = 'review';
    reason = 'Margin floor prevents competitive pricing';
    reviewReasons.push('Margin below minimum threshold');
  }
  
  // Price swing check
  const priceChange = Math.abs(recommendedPrice - currentPrice) / currentPrice;
  if (priceChange > config.price_swing_review_threshold) {
    reviewReasons.push(`Price change of ${Math.round(priceChange * 100)}% exceeds threshold`);
  }
  
  // Offer conflict check
  if (validOffers.length >= 2) {
    const priceSpread = (validOffers[validOffers.length - 1].effective_price - lowestPrice) / lowestPrice;
    if (priceSpread > 0.25) {
      reviewReasons.push('Significant spread in competitor pricing');
      confidence *= 0.9;
    }
  }
  
  // Recalculate final margin
  const finalMargin = calculateMargin(recommendedPrice, effectiveCost);
  
  // Determine auto-publish eligibility
  const autoPublishEligible = 
    reviewReasons.length === 0 && 
    confidence >= config.auto_publish_confidence &&
    action !== 'review' &&
    meetsMarginFloor(recommendedPrice, effectiveCost, config);
  
  return {
    canonical_product_id: product.canonical_product_id,
    current_price: currentPrice,
    recommended_price: Math.round(recommendedPrice * 100) / 100,
    action,
    reason,
    lowest_trusted_comparable_price: Math.round(lowestPrice * 100) / 100,
    estimated_margin_percent_after_change: finalMargin.percent,
    estimated_margin_dollars_after_change: finalMargin.dollars,
    confidence: Math.round(confidence * 100) / 100,
    auto_publish_eligible: autoPublishEligible,
    review_reasons: reviewReasons,
    _debug: {
      valid_offers: validOffers.length,
      effective_cost: effectiveCost,
      min_price: Math.round(minPrice * 100) / 100,
      current_margin: currentMargin
    }
  };
}

// ==============================================================================
// BATCH PROCESSING
// ==============================================================================

function processPricingBatch(products, config = DEFAULT_CONFIG) {
  const results = {
    processed: 0,
    keep: 0,
    lower: 0,
    raise: 0,
    review: 0,
    suppress: 0,
    auto_publish_ready: 0,
    recommendations: []
  };
  
  for (const product of products) {
    const recommendation = generateRecommendation(product, config);
    results.recommendations.push(recommendation);
    results.processed++;
    results[recommendation.action]++;
    
    if (recommendation.auto_publish_eligible) {
      results.auto_publish_ready++;
    }
  }
  
  return results;
}

function generatePricingReport(results) {
  let report = '';
  report += '\n' + '═'.repeat(70) + '\n';
  report += '     COMPETITIVE PRICING ANALYSIS REPORT\n';
  report += '═'.repeat(70) + '\n\n';
  
  report += `Products Analyzed:     ${results.processed}\n`;
  report += `Keep Price:            ${results.keep}\n`;
  report += `Lower Price:           ${results.lower}\n`;
  report += `Raise Price:           ${results.raise}\n`;
  report += `Manual Review:         ${results.review}\n`;
  report += `Auto-Publish Ready:    ${results.auto_publish_ready}\n`;
  
  // Recommendations summary
  const priceChanges = results.recommendations.filter(r => r.action === 'lower' || r.action === 'raise');
  
  if (priceChanges.length > 0) {
    report += '\nRecommended Price Changes:\n';
    report += '-'.repeat(70) + '\n';
    report += 'Product ID'.padEnd(25) + 'Current'.padEnd(12) + 'Recommend'.padEnd(12) + 'Action'.padEnd(10) + 'Confidence\n';
    report += '-'.repeat(70) + '\n';
    
    priceChanges.slice(0, 15).forEach(r => {
      report += `${String(r.canonical_product_id).slice(0, 23).padEnd(25)}`;
      report += `$${r.current_price.toFixed(2).padEnd(10)}`;
      report += `$${r.recommended_price.toFixed(2).padEnd(10)}`;
      report += `${r.action.padEnd(10)}`;
      report += `${Math.round(r.confidence * 100)}%\n`;
    });
    
    if (priceChanges.length > 15) {
      report += `... and ${priceChanges.length - 15} more\n`;
    }
  }
  
  // Review queue
  const reviewQueue = results.recommendations.filter(r => r.review_reasons.length > 0);
  
  if (reviewQueue.length > 0) {
    report += '\nReview Queue:\n';
    report += '-'.repeat(70) + '\n';
    
    reviewQueue.slice(0, 10).forEach(r => {
      report += `[${String(r.canonical_product_id).slice(0, 20)}]\n`;
      r.review_reasons.forEach(reason => {
        report += `  ⚠ ${reason}\n`;
      });
    });
  }
  
  // Margin analysis
  const margins = results.recommendations
    .map(r => r.estimated_margin_percent_after_change)
    .filter(m => m > 0);
  
  if (margins.length > 0) {
    const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
    const minMargin = Math.min(...margins);
    const maxMargin = Math.max(...margins);
    
    report += '\nMargin Analysis (After Recommendations):\n';
    report += `-`.repeat(70) + '\n';
    report += `Average Margin:        ${(avgMargin * 100).toFixed(1)}%\n`;
    report += `Lowest Margin:         ${(minMargin * 100).toFixed(1)}%\n`;
    report += `Highest Margin:        ${(maxMargin * 100).toFixed(1)}%\n`;
  }
  
  report += '\n' + '═'.repeat(70) + '\n';
  
  return report;
}

// ==============================================================================
// PRICE MONITORING HELPERS
// ==============================================================================

function createPricingInput(product, competitorData) {
  return {
    canonical_product_id: product.id || product.sku,
    current_price: product.price || product.msrp || 0,
    current_cost: product.cost || product.wholesale_cost || 0,
    map_price: product.map_price || 0,
    minimum_margin_percent: 0.22,
    minimum_margin_dollars: 1.50,
    shipping_cost_estimate: product.shipping_cost || 2.50,
    competitor_offers: competitorData.map(c => ({
      source_name: c.source || c.retailer || 'unknown',
      source_url: c.url || '',
      visible_price: c.price || 0,
      shipping_estimate: c.shipping || null,
      availability: c.availability || 'in_stock',
      offer_confidence: c.confidence || 0.7,
      same_brand: c.same_brand !== false,
      same_pack: c.same_pack !== false,
      notes: c.notes || ''
    }))
  };
}

// ==============================================================================
// EXPORTS
// ==============================================================================

module.exports = {
  generateRecommendation,
  processPricingBatch,
  generatePricingReport,
  validateOffer,
  normalizeOffers,
  calculateMargin,
  meetsMarginFloor,
  calculateMinimumPrice,
  createPricingInput,
  DEFAULT_CONFIG,
  TRUSTED_SOURCES,
  UNTRUSTED_SOURCES
};
