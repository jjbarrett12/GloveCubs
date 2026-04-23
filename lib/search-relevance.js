/**
 * Search Relevance Scoring
 * 
 * Calculates relevance scores for product search results.
 * Higher scores = better matches.
 */

/**
 * Calculate relevance score for a product against a search query.
 * @param {Object} product - Product object
 * @param {string} query - Search query (lowercase)
 * @returns {number} Relevance score (0-100)
 */
function calculateRelevanceScore(product, query) {
  if (!query || !product) return 0;
  
  const queryTerms = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 1);
  if (queryTerms.length === 0) return 0;
  
  let score = 0;
  
  const name = (product.name || '').toLowerCase();
  const sku = (product.sku || '').toLowerCase();
  const brand = (product.brand || '').toLowerCase();
  const material = (product.material || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const category = (product.category || '').toLowerCase();
  
  // Exact SKU match = highest score
  if (sku === query) {
    return 100;
  }
  
  // SKU contains query (starts with or contains)
  if (sku.startsWith(query)) {
    score += 50;
  } else if (sku.includes(query)) {
    score += 30;
  }
  
  // Full query in product name = high score
  if (name.includes(query)) {
    score += 40;
  }
  
  // Score each term
  for (const term of queryTerms) {
    // Exact term in name (word boundary) = high score
    const nameWordMatch = new RegExp(`\\b${escapeRegex(term)}\\b`).test(name);
    if (nameWordMatch) {
      score += 15;
    } else if (name.includes(term)) {
      score += 8;
    }
    
    // Brand match = good
    if (brand.includes(term)) {
      score += 12;
    }
    
    // Material match = good
    if (material.includes(term)) {
      score += 10;
    }
    
    // Category match
    if (category.includes(term)) {
      score += 8;
    }
    
    // Description match = lower priority
    if (description.includes(term)) {
      score += 3;
    }
  }
  
  // Boost featured products
  if (product.featured) {
    score += 5;
  }
  
  // Boost in-stock products
  if (product.in_stock) {
    score += 3;
  }
  
  // Normalize to 0-100 range
  return Math.min(100, Math.max(0, score));
}

/**
 * Sort products by relevance score.
 * @param {Object[]} products - Array of products
 * @param {string} query - Search query
 * @returns {Object[]} Products sorted by relevance (highest first) with score attached
 */
function sortByRelevance(products, query) {
  if (!query || !products || products.length === 0) {
    return products;
  }
  
  const queryLower = query.toLowerCase().trim();
  
  // Calculate scores and attach to products
  const scoredProducts = products.map(product => ({
    ...product,
    relevance_score: calculateRelevanceScore(product, queryLower)
  }));
  
  // Sort by relevance score (highest first), then by name for ties
  scoredProducts.sort((a, b) => {
    if (b.relevance_score !== a.relevance_score) {
      return b.relevance_score - a.relevance_score;
    }
    return (a.name || '').localeCompare(b.name || '');
  });
  
  return scoredProducts;
}

/**
 * Escape regex special characters.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  calculateRelevanceScore,
  sortByRelevance,
};
