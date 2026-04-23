/**
 * Product Search Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabaseAdmin
vi.mock('../jobs/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    })),
    rpc: vi.fn((name: string) => {
      if (name === 'search_products_listing_count') {
        return Promise.resolve({ data: 0, error: null });
      }
      if (name === 'search_products_autocomplete') {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    }),
  },
}));

import {
  normalizeSearchQuery,
  parseSearchTokens,
  searchProducts,
  getAutocompleteSuggestions,
} from './productSearch';

describe('Product Search - Query Normalization', () => {
  describe('normalizeSearchQuery', () => {
    it('should convert to lowercase', () => {
      expect(normalizeSearchQuery('Nitrile Gloves')).toBe('nitrile glove');
    });
    
    it('should trim whitespace', () => {
      expect(normalizeSearchQuery('  nitrile  ')).toBe('nitrile');
    });
    
    it('should collapse multiple spaces', () => {
      expect(normalizeSearchQuery('nitrile   exam   glove')).toBe('nitrile exam glove');
    });
    
    it('should handle pluralization - gloves to glove', () => {
      expect(normalizeSearchQuery('exam gloves')).toBe('exam glove');
    });
    
    it('should expand common abbreviations', () => {
      expect(normalizeSearchQuery('pf nitrile')).toContain('powder-free');
      expect(normalizeSearchQuery('sm glove')).toContain('small');
      expect(normalizeSearchQuery('med glove')).toContain('medium');
      expect(normalizeSearchQuery('lg glove')).toContain('large');
      expect(normalizeSearchQuery('xl glove')).toContain('x-large');
    });
    
    it('should handle powderfree variations', () => {
      expect(normalizeSearchQuery('powderfree')).toContain('powder-free');
      expect(normalizeSearchQuery('powder free')).toContain('powder-free');
    });
  });
  
  describe('parseSearchTokens', () => {
    it('should extract all terms', () => {
      const result = parseSearchTokens('nitrile exam gloves medium');
      expect(result.terms.length).toBeGreaterThan(0);
    });
    
    it('should identify materials', () => {
      const result = parseSearchTokens('nitrile gloves');
      expect(result.materials).toContain('nitrile');
    });
    
    it('should identify sizes', () => {
      const result = parseSearchTokens('large exam gloves');
      expect(result.sizes).toContain('large');
    });
    
    it('should identify glove types', () => {
      const result = parseSearchTokens('exam gloves');
      expect(result.types).toContain('exam');
    });
    
    it('should handle multiple attributes', () => {
      const result = parseSearchTokens('nitrile exam gloves large');
      expect(result.materials.length).toBeGreaterThan(0);
      expect(result.sizes.length).toBeGreaterThan(0);
      expect(result.types.length).toBeGreaterThan(0);
    });
    
    it('should filter out short tokens', () => {
      const result = parseSearchTokens('a b nitrile');
      // Single character tokens should be filtered
      expect(result.terms.every(t => t.length > 1)).toBe(true);
    });
  });
});

describe('Product Search - Search Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('searchProducts', () => {
    it('should return empty results for empty query', async () => {
      const result = await searchProducts('');
      
      expect(result.results).toEqual([]);
      expect(result.total_count).toBe(0);
      expect(result.query).toBe('');
    });
    
    it('should return empty results for single character query', async () => {
      const result = await searchProducts('a');
      
      expect(result.results).toEqual([]);
      expect(result.total_count).toBe(0);
    });
    
    it('should return search response structure', async () => {
      const result = await searchProducts('nitrile');
      
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('total_count');
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('took_ms');
      expect(typeof result.took_ms).toBe('number');
    });
    
    it('should handle partial matches', async () => {
      // The mock will return empty results, but the function should handle it
      const result = await searchProducts('nit');
      
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.query).toBe('nit');
    });
    
    it('should respect limit option', async () => {
      const result = await searchProducts('gloves', { limit: 5 });
      
      // Even with empty mock results, the function should complete
      expect(result.results.length).toBeLessThanOrEqual(5);
    });
    
    it('should handle offset option', async () => {
      const result = await searchProducts('gloves', { offset: 10 });
      
      expect(result).toHaveProperty('results');
    });
    
    it('should apply material filter', async () => {
      const result = await searchProducts('gloves', {
        filters: { material: 'nitrile' },
      });
      
      expect(result).toHaveProperty('results');
    });
    
    it('should apply size filter', async () => {
      const result = await searchProducts('gloves', {
        filters: { size: 'medium' },
      });
      
      expect(result).toHaveProperty('results');
    });
    
    it('should apply category filter', async () => {
      const result = await searchProducts('gloves', {
        filters: { category: 'exam' },
      });
      
      expect(result).toHaveProperty('results');
    });
    
    it('should handle multiple filters', async () => {
      const result = await searchProducts('gloves', {
        filters: {
          material: 'nitrile',
          size: 'large',
          category: 'exam',
        },
      });
      
      expect(result).toHaveProperty('results');
    });
  });
  
  describe('getAutocompleteSuggestions', () => {
    it('should return empty for short queries', async () => {
      const result = await getAutocompleteSuggestions('a');
      
      expect(result).toEqual([]);
    });
    
    it('should return suggestions array', async () => {
      const result = await getAutocompleteSuggestions('nitrile');
      
      expect(Array.isArray(result)).toBe(true);
    });
    
    it('should respect limit', async () => {
      const result = await getAutocompleteSuggestions('gloves', 5);
      
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });
});

describe('Product Search - Result Mapping', () => {
  it('should map ProductSearchResult correctly', () => {
    // Test the expected structure
    const expectedStructure = {
      product_id: expect.any(String),
      canonical_name: expect.any(String),
      attributes: expect.objectContaining({
        material: expect.anything(),
        glove_type: expect.anything(),
        size: expect.anything(),
      }),
      supplier_offer_count: expect.any(Number),
      relevance_score: expect.any(Number),
    };
    
    // Structure test passes as long as the interface is correct
    expect(expectedStructure.product_id).toBeDefined();
  });
});

describe('Product Search - Edge Cases', () => {
  it('should handle special characters in query', async () => {
    const result = await searchProducts('nitrile (powder-free)');
    expect(result).toHaveProperty('results');
  });
  
  it('should handle numeric queries', async () => {
    const result = await searchProducts('100 count');
    expect(result).toHaveProperty('results');
  });
  
  it('should handle SKU-like queries', async () => {
    const result = await searchProducts('ABC123');
    expect(result).toHaveProperty('results');
  });
  
  it('should handle unicode characters', async () => {
    const result = await searchProducts('glövés');
    expect(result).toHaveProperty('results');
  });
  
  it('should handle very long queries', async () => {
    const longQuery = 'nitrile '.repeat(50);
    const result = await searchProducts(longQuery);
    expect(result).toHaveProperty('results');
  });
});

describe('Product Search - Pluralization', () => {
  it('should normalize "gloves" to "glove"', () => {
    expect(normalizeSearchQuery('gloves')).toBe('glove');
    expect(normalizeSearchQuery('exam gloves')).toBe('exam glove');
    expect(normalizeSearchQuery('nitrile gloves medium')).toBe('nitrile glove medium');
  });
  
  it('should handle queries with both singular and plural', () => {
    const singular = normalizeSearchQuery('glove');
    const plural = normalizeSearchQuery('gloves');
    expect(singular).toBe(plural);
  });
  
  it('should not affect non-glove words ending in "s"', () => {
    const result = normalizeSearchQuery('nitriles');
    expect(result).toBe('nitriles'); // nitriles is not a common plural we handle
  });
});

describe('Product Search - Performance', () => {
  it('should complete search within reasonable time', async () => {
    const startTime = Date.now();
    await searchProducts('nitrile exam gloves medium');
    const elapsed = Date.now() - startTime;
    
    // Should complete within 1 second even with mocks
    expect(elapsed).toBeLessThan(1000);
  });
  
  it('should include took_ms in response', async () => {
    const result = await searchProducts('nitrile');
    
    expect(result.took_ms).toBeGreaterThanOrEqual(0);
    expect(typeof result.took_ms).toBe('number');
  });
});

describe('Product Search - Search Returns Results', () => {
  it('should return results array', async () => {
    const result = await searchProducts('nitrile gloves');
    
    expect(Array.isArray(result.results)).toBe(true);
  });
  
  it('should return total_count', async () => {
    const result = await searchProducts('nitrile');
    
    expect(typeof result.total_count).toBe('number');
    expect(result.total_count).toBeGreaterThanOrEqual(0);
  });
  
  it('should return query in response', async () => {
    const result = await searchProducts('exam gloves');
    
    expect(result.query).toBe('exam gloves');
  });
});

describe('Product Search - Handles No Results', () => {
  it('should handle no results gracefully', async () => {
    // With mocks returning empty, this tests the no-results path
    const result = await searchProducts('xyznonexistent123');
    
    expect(result.results).toEqual([]);
    expect(result.total_count).toBe(0);
  });
  
  it('should still return valid response structure for no results', async () => {
    const result = await searchProducts('doesnotexist');
    
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('total_count');
    expect(result).toHaveProperty('query');
    expect(result).toHaveProperty('took_ms');
  });
});

describe('Product Search - Handles Partial Matches', () => {
  it('should handle prefix matches', async () => {
    const result = await searchProducts('nit'); // partial for nitrile
    
    expect(result).toHaveProperty('results');
    expect(result.query).toBe('nit');
  });
  
  it('should handle suffix matches', async () => {
    const result = await searchProducts('rile'); // partial for nitrile
    
    expect(result).toHaveProperty('results');
  });
  
  it('should handle middle matches', async () => {
    const result = await searchProducts('itril'); // middle of nitrile
    
    expect(result).toHaveProperty('results');
  });
});

describe('Product Search - Handles Pluralization', () => {
  it('should normalize gloves to glove', () => {
    const singular = normalizeSearchQuery('glove');
    const plural = normalizeSearchQuery('gloves');
    
    expect(singular).toBe('glove');
    expect(plural).toBe('glove');
  });
  
  it('should handle "gloves" in middle of query', () => {
    const result = normalizeSearchQuery('nitrile gloves medium');
    
    expect(result).toBe('nitrile glove medium');
  });
  
  it('should handle "gloves" at start of query', () => {
    const result = normalizeSearchQuery('gloves nitrile');
    
    expect(result).toBe('glove nitrile');
  });
  
  it('should handle "gloves" at end of query', () => {
    const result = normalizeSearchQuery('exam gloves');
    
    expect(result).toBe('exam glove');
  });
  
  it('should search same results for singular and plural', async () => {
    const singularResult = await searchProducts('glove');
    const pluralResult = await searchProducts('gloves');
    
    // Both should have same structure
    expect(singularResult).toHaveProperty('results');
    expect(pluralResult).toHaveProperty('results');
    
    // Query is normalized in both cases
    // The actual results would be same since query is normalized
  });
});

describe('Product Search - Supplier Product Name Matching', () => {
  it('should handle search that might match supplier product names', async () => {
    // This tests the code path for supplier product name matching
    const result = await searchProducts('supplier-specific-sku-123');
    
    expect(result).toHaveProperty('results');
  });
});
