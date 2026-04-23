/**
 * Tests for search-relevance module.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { calculateRelevanceScore, sortByRelevance } = require('../lib/search-relevance');

describe('calculateRelevanceScore', () => {
  it('returns 0 for empty query', () => {
    const product = { name: 'Nitrile Gloves', sku: 'NG-001' };
    assert.strictEqual(calculateRelevanceScore(product, ''), 0);
  });

  it('returns 0 for null product', () => {
    assert.strictEqual(calculateRelevanceScore(null, 'nitrile'), 0);
  });

  it('returns 100 for exact SKU match', () => {
    const product = { name: 'Nitrile Gloves', sku: 'ng-001' };
    assert.strictEqual(calculateRelevanceScore(product, 'ng-001'), 100);
  });

  it('scores higher for SKU prefix match', () => {
    const product = { name: 'Nitrile Gloves', sku: 'ng-001-blue' };
    const score = calculateRelevanceScore(product, 'ng-001');
    assert.ok(score >= 50, `Expected score >= 50, got ${score}`);
  });

  it('scores product name matches', () => {
    const product = { name: 'Blue Nitrile Exam Gloves', sku: 'SKU123' };
    const score = calculateRelevanceScore(product, 'nitrile exam');
    assert.ok(score > 0, `Expected score > 0, got ${score}`);
  });

  it('scores brand matches', () => {
    const product = { name: 'Exam Gloves', brand: 'Hospeco', sku: 'SKU123' };
    const score = calculateRelevanceScore(product, 'hospeco');
    assert.ok(score >= 12, `Expected score >= 12, got ${score}`);
  });

  it('scores material matches', () => {
    const product = { name: 'Exam Gloves', material: 'Nitrile', sku: 'SKU123' };
    const score = calculateRelevanceScore(product, 'nitrile');
    assert.ok(score >= 10, `Expected score >= 10, got ${score}`);
  });

  it('boosts featured products', () => {
    const product1 = { name: 'Nitrile Gloves', featured: false };
    const product2 = { name: 'Nitrile Gloves', featured: true };
    const score1 = calculateRelevanceScore(product1, 'nitrile');
    const score2 = calculateRelevanceScore(product2, 'nitrile');
    assert.ok(score2 > score1, `Featured product should score higher: ${score2} > ${score1}`);
  });

  it('boosts in-stock products', () => {
    const product1 = { name: 'Nitrile Gloves', in_stock: false };
    const product2 = { name: 'Nitrile Gloves', in_stock: true };
    const score1 = calculateRelevanceScore(product1, 'nitrile');
    const score2 = calculateRelevanceScore(product2, 'nitrile');
    assert.ok(score2 > score1, `In-stock product should score higher: ${score2} > ${score1}`);
  });

  it('handles multiple search terms', () => {
    const product = { name: 'Blue Nitrile Exam Gloves Large', material: 'Nitrile' };
    const scoreAll = calculateRelevanceScore(product, 'blue nitrile exam');
    // Product with all terms present should have positive score
    assert.ok(scoreAll > 0, `Product matching multiple terms should have positive score: ${scoreAll}`);
    
    // A product not matching the terms should score lower
    const nonMatch = { name: 'Vinyl Black Small Gloves', material: 'Vinyl' };
    const scoreNon = calculateRelevanceScore(nonMatch, 'blue nitrile exam');
    assert.ok(scoreAll > scoreNon, `Matching product should score higher than non-matching: ${scoreAll} > ${scoreNon}`);
  });
});

describe('sortByRelevance', () => {
  it('returns empty array for no products', () => {
    assert.deepStrictEqual(sortByRelevance([], 'nitrile'), []);
  });

  it('returns products unchanged for empty query', () => {
    const products = [{ name: 'A' }, { name: 'B' }];
    assert.deepStrictEqual(sortByRelevance(products, ''), products);
  });

  it('sorts by relevance score descending', () => {
    const products = [
      { name: 'Vinyl Gloves', sku: 'VG-001' },
      { name: 'Nitrile Exam Gloves', sku: 'NE-001' },
      { name: 'Blue Nitrile Heavy Duty', sku: 'nitrile-hd' },
    ];
    const sorted = sortByRelevance(products, 'nitrile');
    assert.ok(sorted[0].name.includes('Nitrile'), `First result should contain "Nitrile": ${sorted[0].name}`);
    assert.ok(sorted[0].relevance_score > sorted[sorted.length - 1].relevance_score,
      `First should score higher than last: ${sorted[0].relevance_score} > ${sorted[sorted.length - 1].relevance_score}`);
  });

  it('attaches relevance_score to each product', () => {
    const products = [{ name: 'Nitrile Gloves' }];
    const sorted = sortByRelevance(products, 'nitrile');
    assert.ok('relevance_score' in sorted[0], 'Should have relevance_score property');
    assert.strictEqual(typeof sorted[0].relevance_score, 'number');
  });

  it('exact SKU match comes first', () => {
    const products = [
      { name: 'Nitrile Gloves with extra features', sku: 'NG-999' },
      { name: 'Basic Gloves', sku: 'ng-001' },
      { name: 'Another Nitrile Product', sku: 'NP-002' },
    ];
    const sorted = sortByRelevance(products, 'ng-001');
    assert.strictEqual(sorted[0].sku, 'ng-001', `Exact SKU match should be first: ${sorted[0].sku}`);
    assert.strictEqual(sorted[0].relevance_score, 100, 'Exact SKU should score 100');
  });

  it('sorts alphabetically by name for equal scores', () => {
    const products = [
      { name: 'Zebra Gloves', material: 'Vinyl' },
      { name: 'Alpha Gloves', material: 'Vinyl' },
      { name: 'Beta Gloves', material: 'Vinyl' },
    ];
    const sorted = sortByRelevance(products, 'vinyl');
    const names = sorted.map(p => p.name);
    assert.deepStrictEqual(names, ['Alpha Gloves', 'Beta Gloves', 'Zebra Gloves']);
  });

  it('handles case-insensitive matching', () => {
    const products = [{ name: 'NITRILE GLOVES', sku: 'NG-001' }];
    const sorted = sortByRelevance(products, 'Nitrile');
    assert.ok(sorted[0].relevance_score > 0, `Should match case-insensitively: ${sorted[0].relevance_score}`);
  });
});
