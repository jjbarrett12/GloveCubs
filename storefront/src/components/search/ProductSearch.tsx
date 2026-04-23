'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// TYPES
// ============================================================================

interface ProductSearchResult {
  product_id: string;
  canonical_name: string;
  normalized_name?: string;
  sku?: string;
  attributes: {
    material?: string;
    glove_type?: string;
    size?: string;
    color?: string;
    pack_size?: number;
    category?: string;
  };
  supplier_offer_count: number;
  trusted_best_price?: number;
  trusted_best_supplier?: string;
  relevance_score: number;
}

interface SearchResponse {
  results: ProductSearchResult[];
  total_count: number;
  query: string;
  took_ms: number;
}

interface ProductSearchProps {
  onSelect?: (product: ProductSearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  showResults?: boolean;
  initialQuery?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ProductSearch({
  onSelect,
  placeholder = 'Search products...',
  autoFocus = false,
  className = '',
  showResults = true,
  initialQuery = '',
}: ProductSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchTime, setSearchTime] = useState(0);
  
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      setTotalCount(0);
      setError(null);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `/api/products/search?q=${encodeURIComponent(searchQuery)}&limit=20`
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Search failed');
      }
      
      const data: SearchResponse = await response.json();
      
      setResults(data.results);
      setTotalCount(data.total_count);
      setSearchTime(data.took_ms);
      setSelectedIndex(-1);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Handle input change with debounce
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Debounce search
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!results.length) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setFocused(false);
        inputRef.current?.blur();
        break;
    }
  }, [results, selectedIndex]);
  
  // Handle result selection
  const handleSelect = useCallback((product: ProductSearchResult) => {
    if (onSelect) {
      onSelect(product);
    }
    setQuery(product.canonical_name);
    setFocused(false);
  }, [onSelect]);
  
  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setFocused(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);
  
  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const items = resultsRef.current.querySelectorAll('[data-result-item]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);
  
  const showDropdown = Boolean(
    focused &&
      showResults &&
      (results.length > 0 || loading || Boolean(error) || query.length >= 2)
  );
  
  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <input
          ref={(el) => { inputRef.current = el; }}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex h-10 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pr-10 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          aria-label="Search products"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          role="combobox"
        />
        
        {/* Loading spinner */}
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
        
        {/* Clear button */}
        {!loading && query && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
            onClick={() => {
              setQuery('');
              setResults([]);
              setTotalCount(0);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            ×
          </Button>
        )}
      </div>
      
      {/* Results Dropdown */}
      {showDropdown && (
        <div
          ref={resultsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-auto"
          role="listbox"
        >
          {/* Loading State */}
          {loading && (
            <div className="p-4 text-center text-gray-500">
              <div className="animate-pulse">Searching...</div>
            </div>
          )}
          
          {/* Error State */}
          {error && !loading && (
            <div className="p-4 text-center text-red-500">
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => performSearch(query)}
              >
                Retry
              </Button>
            </div>
          )}
          
          {/* Empty State */}
          {!loading && !error && query.length >= 2 && results.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              <p className="font-medium">No products found</p>
              <p className="text-sm mt-1">Try a different search term</p>
            </div>
          )}
          
          {/* Results List */}
          {!loading && !error && results.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs text-gray-500 border-b">
                {totalCount} result{totalCount !== 1 ? 's' : ''} ({searchTime}ms)
              </div>
              
              {results.map((product, index) => (
                <div
                  key={product.product_id}
                  data-result-item
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={`p-3 cursor-pointer border-b last:border-b-0 transition-colors ${
                    index === selectedIndex
                      ? 'bg-blue-50'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleSelect(product)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {product.canonical_name}
                      </p>
                      
                      {product.sku && (
                        <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                      )}
                      
                      <div className="flex flex-wrap gap-1 mt-1">
                        {product.attributes.material && (
                          <Badge variant="outline" className="text-xs">
                            {product.attributes.material}
                          </Badge>
                        )}
                        {product.attributes.size && (
                          <Badge variant="outline" className="text-xs">
                            {product.attributes.size}
                          </Badge>
                        )}
                        {product.attributes.pack_size && (
                          <Badge variant="outline" className="text-xs">
                            {product.attributes.pack_size} ct
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      {product.trusted_best_price ? (
                        <div>
                          <p className="text-lg font-bold text-green-600">
                            ${product.trusted_best_price.toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {product.supplier_offer_count} offer{product.supplier_offer_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">
                          {product.supplier_offer_count} offer{product.supplier_offer_count !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {totalCount > results.length && (
                <div className="p-3 text-center text-sm text-gray-500 bg-gray-50">
                  Showing {results.length} of {totalCount} results
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SEARCH PAGE COMPONENT
// ============================================================================

export function ProductSearchPage() {
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [page, setPage] = useState(0);
  const [searchTime, setSearchTime] = useState(0);
  const pageSize = 20;
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  
  const loadResults = useCallback(async (searchQuery: string, pageNum: number) => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      setTotalCount(0);
      setError(null);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `/api/products/search?q=${encodeURIComponent(searchQuery)}&limit=${pageSize}&offset=${pageNum * pageSize}`
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Search failed');
      }
      
      const data: SearchResponse = await response.json();
      setSearchResults(data.results);
      setTotalCount(data.total_count);
      setSearchTime(data.took_ms);
      setSearchedQuery(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Debounced search on input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setPage(0);
    
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Debounce search
    debounceRef.current = setTimeout(() => {
      loadResults(value, 0);
    }, 300);
  }, [loadResults]);
  
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    loadResults(query, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);
  
  const totalPages = Math.ceil(totalCount / pageSize);
  
  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Product Search</h1>
      
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Search for gloves, materials, sizes..."
          autoFocus
          className="flex h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        
        {/* Loading spinner */}
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
      </div>
      
      {/* Error State */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => loadResults(query, page)}
          >
            Retry
          </Button>
        </div>
      )}
      
      {/* Results Grid */}
      {searchResults.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              {totalCount} result{totalCount !== 1 ? 's' : ''} for "{searchedQuery}"
            </p>
            <p className="text-xs text-gray-400">{searchTime}ms</p>
          </div>
          
          <div className="grid gap-4">
            {searchResults.map((product) => (
              <Card key={product.product_id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900">{product.canonical_name}</h3>
                      {product.sku && (
                        <p className="text-sm text-gray-500 mt-0.5">SKU: {product.sku}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {product.attributes.material && (
                          <Badge variant="outline" className="text-xs">
                            {product.attributes.material}
                          </Badge>
                        )}
                        {product.attributes.size && (
                          <Badge variant="outline" className="text-xs">
                            {product.attributes.size}
                          </Badge>
                        )}
                        {product.attributes.glove_type && (
                          <Badge variant="outline" className="text-xs">
                            {product.attributes.glove_type}
                          </Badge>
                        )}
                        {product.attributes.pack_size && (
                          <Badge variant="outline" className="text-xs">
                            {product.attributes.pack_size} ct
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      {product.trusted_best_price ? (
                        <>
                          <p className="text-xl font-bold text-green-600">
                            ${product.trusted_best_price.toFixed(2)}
                          </p>
                          {product.trusted_best_supplier && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              via {product.trusted_best_supplier}
                            </p>
                          )}
                        </>
                      ) : null}
                      <p className="text-sm text-gray-500 mt-1">
                        {product.supplier_offer_count} offer{product.supplier_offer_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 0 || loading}
              >
                Previous
              </Button>
              <span className="flex items-center px-4 text-sm text-gray-600">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages - 1 || loading}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
      
      {/* Loading State (initial) */}
      {loading && searchResults.length === 0 && query.length >= 2 && (
        <div className="mt-8 text-center text-gray-500">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p>Searching...</p>
        </div>
      )}
      
      {/* Empty State */}
      {!loading && !error && query.length >= 2 && searchResults.length === 0 && searchedQuery && (
        <div className="mt-8 text-center text-gray-500">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-lg">No products found for "{searchedQuery}"</p>
          <p className="text-sm mt-2">Try different keywords or check your spelling</p>
          <ul className="text-sm mt-4 text-gray-400">
            <li>• Try searching for a material: nitrile, latex, vinyl</li>
            <li>• Try searching for a size: small, medium, large</li>
            <li>• Try searching for a type: exam, surgical, industrial</li>
          </ul>
        </div>
      )}
      
      {/* Initial State */}
      {!loading && query.length < 2 && searchResults.length === 0 && (
        <div className="mt-8 text-center text-gray-400">
          <p className="text-sm">Type at least 2 characters to search</p>
        </div>
      )}
    </div>
  );
}
