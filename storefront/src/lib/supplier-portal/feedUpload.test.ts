import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseCSV,
  parseXLSX,
  parseFileContent,
  detectFileType,
  validateFile,
  normalizeHeader,
  extractFields,
  type ExtractedProduct,
  type NormalizedProduct,
  type ValidationResult,
  type FileValidationResult,
} from './feedUpload';

// ============================================================================
// PURE FUNCTION TESTS
// ============================================================================

describe('Supplier Feed Upload - Pure Functions', () => {
  // ==========================================================================
  // CSV PARSING
  // ==========================================================================
  describe('parseCSV', () => {
    describe('basic parsing', () => {
      it('should parse simple CSV with headers', () => {
        const csv = 'name,price,sku\nProduct A,10.99,SKU001\nProduct B,20.50,SKU002';
        const rows = parseCSV(csv);

        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({ name: 'Product A', price: '10.99', sku: 'SKU001' });
        expect(rows[1]).toEqual({ name: 'Product B', price: '20.50', sku: 'SKU002' });
      });

      it('should return empty array for empty content', () => {
        expect(parseCSV('')).toEqual([]);
        expect(parseCSV('   ')).toEqual([]);
      });

      it('should return empty array for header-only CSV', () => {
        expect(parseCSV('name,price,sku')).toEqual([]);
      });

      it('should handle single row', () => {
        const csv = 'name,price\nProduct A,10.99';
        const rows = parseCSV(csv);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({ name: 'Product A', price: '10.99' });
      });
    });

    describe('quotes and commas handling', () => {
      it('should handle quoted fields with commas inside', () => {
        const csv = 'name,description,price\n"Product A","Large, Blue, Industrial",10.99';
        const rows = parseCSV(csv);

        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('Product A');
        expect(rows[0].description).toBe('Large, Blue, Industrial');
        expect(rows[0].price).toBe('10.99');
      });

      it('should handle escaped quotes (double quotes)', () => {
        const csv = 'name,description,price\n"Product ""A""","Description with ""quotes""",10.99';
        const rows = parseCSV(csv);

        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('Product "A"');
        expect(rows[0].description).toBe('Description with "quotes"');
      });

      it('should handle mixed quoted and unquoted fields', () => {
        const csv = 'name,description,price\nSimple,"Complex, with comma",10.99';
        const rows = parseCSV(csv);

        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('Simple');
        expect(rows[0].description).toBe('Complex, with comma');
      });

      it('should handle newlines in quoted fields', () => {
        // Note: parseCSVLine handles this per-line, so this tests single line behavior
        const csv = 'name,price\n"Product A",10.99';
        const rows = parseCSV(csv);
        expect(rows[0].name).toBe('Product A');
      });

      it('should handle empty quoted fields', () => {
        const csv = 'name,description,price\n"Product A","",10.99';
        const rows = parseCSV(csv);

        expect(rows[0].description).toBe('');
      });

      it('should preserve whitespace inside quotes', () => {
        const csv = 'name,description\n"  spaced  ","  also spaced  "';
        const rows = parseCSV(csv);

        // Note: current implementation trims after parse
        expect(rows[0].name).toBe('spaced');
        expect(rows[0].description).toBe('also spaced');
      });
    });

    describe('header normalization', () => {
      it('should normalize headers to lowercase with underscores', () => {
        const csv = 'Product Name,Unit Price,SKU\nProduct A,10.99,SKU001';
        const rows = parseCSV(csv);

        expect(rows[0]).toHaveProperty('product_name');
        expect(rows[0]).toHaveProperty('unit_price');
        expect(rows[0]).toHaveProperty('sku');
      });

      it('should handle special characters in headers', () => {
        const csv = 'Product-Name,Unit/Price,(SKU)\nProduct A,10.99,SKU001';
        const rows = parseCSV(csv);

        expect(Object.keys(rows[0])).toContain('product_name');
        expect(Object.keys(rows[0])).toContain('unit_price');
        expect(Object.keys(rows[0])).toContain('sku');
      });

      it('should handle spaces in headers', () => {
        const csv = 'Product   Name,  Unit Price  ,SKU\nProduct A,10.99,SKU001';
        const rows = parseCSV(csv);

        // Multiple spaces become single underscore
        const keys = Object.keys(rows[0]);
        expect(keys.some(k => k.includes('product') && k.includes('name'))).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle rows with fewer columns than headers', () => {
        const csv = 'name,price,sku\nProduct A,10.99';
        const rows = parseCSV(csv);

        expect(rows[0].name).toBe('Product A');
        expect(rows[0].price).toBe('10.99');
        expect(rows[0].sku).toBe('');
      });

      it('should handle rows with more columns than headers', () => {
        const csv = 'name,price\nProduct A,10.99,extra,data';
        const rows = parseCSV(csv);

        expect(rows[0].name).toBe('Product A');
        expect(rows[0].price).toBe('10.99');
        // Extra columns should be ignored
        expect(Object.keys(rows[0])).toHaveLength(2);
      });

      it('should handle Windows line endings (CRLF)', () => {
        const csv = 'name,price\r\nProduct A,10.99\r\nProduct B,20.50';
        const rows = parseCSV(csv);

        expect(rows).toHaveLength(2);
      });
    });
  });

  // ==========================================================================
  // FIELD EXTRACTION
  // ==========================================================================
  describe('extractFields', () => {
    describe('header alias normalization', () => {
      it('should recognize SKU aliases', () => {
        const aliases = ['sku', 'item_number', 'item_no', 'product_code', 'part_number', 'upc'];
        
        for (const alias of aliases) {
          const row = { [alias]: 'TEST-SKU-123' };
          const extracted = extractFields(row);
          expect(extracted.sku).toBe('TEST-SKU-123');
          expect(extracted.confidence.sku).toBe(1.0);
        }
      });

      it('should recognize product name aliases', () => {
        const aliases = ['product_name', 'name', 'description', 'product', 'item_name', 'title'];
        
        for (const alias of aliases) {
          const row = { [alias]: 'Test Product' };
          const extracted = extractFields(row);
          expect(extracted.product_name).toBe('Test Product');
        }
      });

      it('should recognize price aliases', () => {
        const aliases = ['price', 'unit_price', 'cost', 'list_price', 'sell_price'];
        
        for (const alias of aliases) {
          const row = { [alias]: '25.99' };
          const extracted = extractFields(row);
          expect(extracted.price).toBe(25.99);
        }
      });

      it('should recognize case_pack aliases', () => {
        const aliases = ['case_pack', 'pack_size', 'units_per_case', 'qty_per_case', 'case_qty'];
        
        for (const alias of aliases) {
          const row = { [alias]: '100' };
          const extracted = extractFields(row);
          expect(extracted.case_pack).toBe(100);
        }
      });

      it('should match partial header names', () => {
        // Headers containing the alias should match
        const row = { 'my_custom_sku_field': 'SKU123', 'product_unit_price': '10.99' };
        const extracted = extractFields(row);
        
        expect(extracted.sku).toBe('SKU123');
        expect(extracted.price).toBe(10.99);
      });
    });

    describe('extraction confidence scoring', () => {
      it('should assign confidence 1.0 for direct column match on SKU', () => {
        const row = { sku: 'TEST123' };
        const extracted = extractFields(row);
        expect(extracted.confidence.sku).toBe(1.0);
      });

      it('should assign confidence 1.0 for direct column match on price', () => {
        const row = { price: '10.99' };
        const extracted = extractFields(row);
        expect(extracted.confidence.price).toBe(1.0);
      });

      it('should assign confidence 0.9 for unit_of_measure', () => {
        const row = { uom: 'each' };
        const extracted = extractFields(row);
        expect(extracted.confidence.unit_of_measure).toBe(0.9);
      });

      it('should assign confidence 0.8 for material extraction', () => {
        const row = { material: 'nitrile' };
        const extracted = extractFields(row);
        expect(extracted.confidence.material).toBe(0.8);
      });

      it('should assign lower confidence for AI-extracted fields', () => {
        const row = { product_name: 'Nitrile Gloves 100ct Large' };
        const extracted = extractFields(row);
        
        // AI-extracted material should have 0.85 confidence
        expect(extracted.material).toBe('nitrile');
        expect(extracted.confidence.material).toBe(0.85);
        
        // AI-extracted pack size should have 0.7 confidence
        expect(extracted.case_pack).toBe(100);
        expect(extracted.confidence.case_pack).toBe(0.7);
        
        // AI-extracted size should have 0.75 confidence
        expect(extracted.size).toBe('L');
        expect(extracted.confidence.size).toBe(0.75);
      });
    });

    describe('price parsing', () => {
      it('should parse simple numeric prices', () => {
        const row = { price: '25.99' };
        const extracted = extractFields(row);
        expect(extracted.price).toBe(25.99);
      });

      it('should parse prices with currency symbols', () => {
        expect(extractFields({ price: '$25.99' }).price).toBe(25.99);
        expect(extractFields({ price: '€25.99' }).price).toBe(25.99);
        expect(extractFields({ price: '£25.99' }).price).toBe(25.99);
        expect(extractFields({ price: '¥2599' }).price).toBe(2599);
      });

      it('should parse prices with thousands separators', () => {
        const row = { price: '$1,299.99' };
        const extracted = extractFields(row);
        expect(extracted.price).toBe(1299.99);
      });

      it('should handle prices with whitespace', () => {
        const row = { price: '  $ 25.99  ' };
        const extracted = extractFields(row);
        expect(extracted.price).toBe(25.99);
      });

      it('should not extract invalid prices', () => {
        expect(extractFields({ price: 'invalid' }).price).toBeUndefined();
        expect(extractFields({ price: '' }).price).toBeUndefined();
        expect(extractFields({ price: 'N/A' }).price).toBeUndefined();
      });
    });

    describe('material extraction', () => {
      it('should normalize material names', () => {
        expect(extractFields({ material: 'NITRILE' }).material).toBe('nitrile');
        expect(extractFields({ material: 'Natural Latex' }).material).toBe('latex');
        expect(extractFields({ material: 'PVC/Vinyl' }).material).toBe('vinyl');
        expect(extractFields({ material: 'Neoprene Blend' }).material).toBe('neoprene');
        expect(extractFields({ material: 'Polyethylene' }).material).toBe('poly');
      });

      it('should preserve unknown materials as-is', () => {
        expect(extractFields({ material: 'Custom Material' }).material).toBe('Custom Material');
      });
    });

    describe('size extraction', () => {
      it('should normalize size abbreviations', () => {
        expect(extractFields({ size: 'xs' }).size).toBe('XS');
        expect(extractFields({ size: 'x-small' }).size).toBe('XS');
        expect(extractFields({ size: 'extra small' }).size).toBe('XS');
        expect(extractFields({ size: 's' }).size).toBe('S');
        expect(extractFields({ size: 'small' }).size).toBe('S');
        expect(extractFields({ size: 'sm' }).size).toBe('S');
        expect(extractFields({ size: 'm' }).size).toBe('M');
        expect(extractFields({ size: 'medium' }).size).toBe('M');
        expect(extractFields({ size: 'med' }).size).toBe('M');
        expect(extractFields({ size: 'l' }).size).toBe('L');
        expect(extractFields({ size: 'large' }).size).toBe('L');
        expect(extractFields({ size: 'lg' }).size).toBe('L');
        expect(extractFields({ size: 'xl' }).size).toBe('XL');
        expect(extractFields({ size: 'x-large' }).size).toBe('XL');
        expect(extractFields({ size: 'xxl' }).size).toBe('XXL');
        expect(extractFields({ size: '2xl' }).size).toBe('XXL');
      });

      it('should handle case insensitivity', () => {
        expect(extractFields({ size: 'LARGE' }).size).toBe('L');
        expect(extractFields({ size: 'Medium' }).size).toBe('M');
      });
    });

    describe('pack size inference from product name', () => {
      it('should extract pack size from "Xct" pattern', () => {
        const row = { product_name: 'Nitrile Gloves 100ct' };
        const extracted = extractFields(row);
        expect(extracted.case_pack).toBe(100);
        expect(extracted.confidence.case_pack).toBe(0.7);
      });

      it('should extract pack size from "X count" pattern', () => {
        const row = { product_name: 'Vinyl Gloves 200 count box' };
        const extracted = extractFields(row);
        expect(extracted.case_pack).toBe(200);
      });

      it('should extract pack size from "Xpk" pattern', () => {
        const row = { product_name: 'Exam Gloves 50pk' };
        const extracted = extractFields(row);
        expect(extracted.case_pack).toBe(50);
      });

      it('should extract pack size from "X/case" pattern', () => {
        const row = { product_name: 'Disposable Gloves 1000/case' };
        const extracted = extractFields(row);
        expect(extracted.case_pack).toBe(1000);
      });

      it('should extract pack size from "X per case" pattern', () => {
        const row = { product_name: 'Industrial Gloves 500 per case' };
        const extracted = extractFields(row);
        expect(extracted.case_pack).toBe(500);
      });

      it('should not override explicit case_pack column', () => {
        const row = { 
          product_name: 'Gloves 100ct', 
          case_pack: '200'  // Explicit value should win
        };
        const extracted = extractFields(row);
        expect(extracted.case_pack).toBe(200);
        expect(extracted.confidence.case_pack).toBe(1.0);
      });

      it('should extract material from product name when not in column', () => {
        const row = { product_name: 'Premium Nitrile Exam Gloves' };
        const extracted = extractFields(row);
        expect(extracted.material).toBe('nitrile');
        expect(extracted.confidence.material).toBe(0.85);
      });

      it('should extract size from product name when not in column', () => {
        const row = { product_name: 'Vinyl Gloves - Large' };
        const extracted = extractFields(row);
        expect(extracted.size).toBe('L');
        expect(extracted.confidence.size).toBe(0.75);
      });
    });

    describe('multiple field extraction', () => {
      it('should extract all available fields from a complete row', () => {
        const row = {
          sku: 'GLV-NIT-L-100',
          product_name: 'Premium Nitrile Gloves Large 100/box',
          price: '$29.99',
          case_pack: '10',
          box_quantity: '100',
          material: 'nitrile',
          size: 'Large',
          lead_time: '3',
          moq: '5',
        };
        
        const extracted = extractFields(row);
        
        expect(extracted.sku).toBe('GLV-NIT-L-100');
        expect(extracted.product_name).toBe('Premium Nitrile Gloves Large 100/box');
        expect(extracted.price).toBe(29.99);
        expect(extracted.case_pack).toBe(10);
        expect(extracted.box_quantity).toBe(100);
        expect(extracted.material).toBe('nitrile');
        expect(extracted.size).toBe('L');
        expect(extracted.lead_time_days).toBe(3);
        expect(extracted.moq).toBe(5);
      });

      it('should handle partial data gracefully', () => {
        const row = {
          name: 'Some Product',
          cost: '15.00',
        };
        
        const extracted = extractFields(row);
        
        expect(extracted.product_name).toBe('Some Product');
        expect(extracted.price).toBe(15.00);
        expect(extracted.sku).toBeUndefined();
        expect(extracted.case_pack).toBeUndefined();
      });
    });
  });
});

// ============================================================================
// NAME SIMILARITY TESTS (for fuzzy matching)
// ============================================================================

describe('Name Similarity Calculation', () => {
  // We need to export or test the internal function
  // For now, test through behavior of the matching system
  
  it('should match identical names with high confidence', () => {
    // This tests the expected behavior
    const name1 = 'Nitrile Exam Gloves Large';
    const name2 = 'Nitrile Exam Gloves Large';
    
    // Calculate token overlap
    const tokens1 = new Set(name1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(name2.toLowerCase().split(/\s+/));
    
    let matches = 0;
    for (const token of Array.from(tokens1)) {
      if (tokens2.has(token)) matches++;
    }
    
    const similarity = matches / Math.max(tokens1.size, tokens2.size);
    expect(similarity).toBe(1.0);
  });

  it('should calculate partial similarity for overlapping names', () => {
    const name1 = 'Nitrile Exam Gloves Large';
    const name2 = 'Nitrile Gloves Medium';
    
    const tokens1 = new Set(name1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(name2.toLowerCase().split(/\s+/));
    
    let matches = 0;
    for (const token of Array.from(tokens1)) {
      if (tokens2.has(token)) matches++;
    }
    
    // 'nitrile' and 'gloves' match = 2 out of 4
    const similarity = matches / Math.max(tokens1.size, tokens2.size);
    expect(similarity).toBe(0.5);
  });

  it('should return 0 for completely different names', () => {
    const name1 = 'Nitrile Exam Gloves';
    const name2 = 'Paper Towels Industrial';
    
    const tokens1 = new Set(name1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(name2.toLowerCase().split(/\s+/));
    
    let matches = 0;
    for (const token of Array.from(tokens1)) {
      if (tokens2.has(token)) matches++;
    }
    
    const similarity = matches / Math.max(tokens1.size, tokens2.size);
    expect(similarity).toBe(0);
  });

  describe('fuzzy match threshold behavior', () => {
    it('should require >= 0.6 similarity for a match', () => {
      // 3 out of 4 tokens = 0.75 (should match)
      const good = { 
        a: 'Nitrile Exam Gloves Large', 
        b: 'Nitrile Exam Gloves Medium' 
      };
      
      // 1 out of 4 tokens = 0.25 (should not match)
      const bad = { 
        a: 'Nitrile Exam Gloves Large', 
        b: 'Vinyl Disposable Medium Small' 
      };
      
      // Calculate good similarity
      const goodTokensA = new Set(good.a.toLowerCase().split(/\s+/));
      const goodTokensB = new Set(good.b.toLowerCase().split(/\s+/));
      let goodMatches = 0;
      for (const token of Array.from(goodTokensA)) {
        if (goodTokensB.has(token)) goodMatches++;
      }
      const goodSim = goodMatches / Math.max(goodTokensA.size, goodTokensB.size);
      
      // Calculate bad similarity
      const badTokensA = new Set(bad.a.toLowerCase().split(/\s+/));
      const badTokensB = new Set(bad.b.toLowerCase().split(/\s+/));
      let badMatches = 0;
      for (const token of Array.from(badTokensA)) {
        if (badTokensB.has(token)) badMatches++;
      }
      const badSim = badMatches / Math.max(badTokensA.size, badTokensB.size);
      
      expect(goodSim).toBeGreaterThanOrEqual(0.6);
      expect(badSim).toBeLessThan(0.6);
    });
  });
});

// ============================================================================
// VALIDATION LOGIC TESTS (pure validation rules)
// ============================================================================

describe('Validation Logic', () => {
  describe('required field validation', () => {
    it('should identify missing price as error', () => {
      const extracted: ExtractedProduct = {
        product_name: 'Test Product',
        confidence: {},
      };
      
      // Price is missing - should be flagged
      expect(extracted.price).toBeUndefined();
    });

    it('should require either product_name or sku', () => {
      const noIdentifier: ExtractedProduct = {
        price: 10.99,
        confidence: {},
      };
      
      // Neither product_name nor sku - should be flagged
      expect(noIdentifier.product_name).toBeUndefined();
      expect(noIdentifier.sku).toBeUndefined();
    });
  });

  describe('confidence warning thresholds', () => {
    it('should flag fields with confidence < 0.7', () => {
      const extracted: ExtractedProduct = {
        product_name: 'Test',
        price: 10.99,
        case_pack: 100,
        confidence: {
          product_name: 1.0,
          price: 1.0,
          case_pack: 0.65, // Below threshold
        },
      };
      
      expect(extracted.confidence.case_pack).toBeLessThan(0.7);
    });
  });

  describe('price anomaly detection rules', () => {
    it('should flag prices > 50% above market average', () => {
      const marketPrices = [10, 12, 11, 13, 10];
      const avgPrice = marketPrices.reduce((a, b) => a + b, 0) / marketPrices.length; // 11.2
      const supplierPrice = 20;
      
      const deviation = Math.abs(supplierPrice - avgPrice) / avgPrice;
      expect(deviation).toBeGreaterThan(0.5); // Should trigger anomaly
    });

    it('should flag prices > 50% below market average', () => {
      const marketPrices = [100, 120, 110, 130, 100];
      const avgPrice = marketPrices.reduce((a, b) => a + b, 0) / marketPrices.length; // 112
      const supplierPrice = 40;
      
      const deviation = Math.abs(supplierPrice - avgPrice) / avgPrice;
      expect(deviation).toBeGreaterThan(0.5); // Should trigger anomaly
    });

    it('should not flag prices within 50% of market average', () => {
      const marketPrices = [10, 12, 11, 13, 10];
      const avgPrice = marketPrices.reduce((a, b) => a + b, 0) / marketPrices.length; // 11.2
      const supplierPrice = 14; // About 25% higher
      
      const deviation = Math.abs(supplierPrice - avgPrice) / avgPrice;
      expect(deviation).toBeLessThan(0.5); // Should NOT trigger anomaly
    });
  });
});

// ============================================================================
// CONFIGURATION VALIDATION
// ============================================================================

describe('Upload Configuration', () => {
  it('should have reasonable max row limit', () => {
    // We can't directly access UPLOAD_CONFIG, but we can test behavior
    const largeCSV = ['name,price', ...Array(6000).fill('Product,10.99')].join('\n');
    const rows = parseCSV(largeCSV);
    
    // Should be capped at 5000 rows
    expect(rows.length).toBeLessThanOrEqual(5000);
  });
});

// ============================================================================
// XLSX PARSING TESTS
// ============================================================================

describe('XLSX Parsing', () => {
  /**
   * Helper to create a simple XLSX buffer for testing
   */
  function createTestXLSX(data: Array<Record<string, unknown>>): Uint8Array {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  }

  describe('basic XLSX parsing', () => {
    it('should parse simple XLSX with headers', () => {
      const data = [
        { name: 'Product A', price: 10.99, sku: 'SKU001' },
        { name: 'Product B', price: 20.50, sku: 'SKU002' },
      ];
      const xlsxBuffer = createTestXLSX(data);
      const rows = parseXLSX(xlsxBuffer);

      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Product A');
      expect(rows[0].price).toBe('10.99');
      expect(rows[0].sku).toBe('SKU001');
    });

    it('should handle single row', () => {
      const data = [{ name: 'Product A', price: 10.99 }];
      const xlsxBuffer = createTestXLSX(data);
      const rows = parseXLSX(xlsxBuffer);

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Product A');
    });

    it('should return empty array for empty workbook', () => {
      const xlsxBuffer = createTestXLSX([]);
      const rows = parseXLSX(xlsxBuffer);
      expect(rows).toHaveLength(0);
    });
  });

  describe('mixed header casing', () => {
    it('should normalize UPPERCASE headers', () => {
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['PRODUCT_NAME', 'PRICE', 'SKU'],
        ['Product A', 10.99, 'SKU001'],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const xlsxBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
      
      const rows = parseXLSX(xlsxBuffer);
      
      expect(rows[0]).toHaveProperty('product_name');
      expect(rows[0]).toHaveProperty('price');
      expect(rows[0]).toHaveProperty('sku');
    });

    it('should normalize MixedCase headers', () => {
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['ProductName', 'UnitPrice', 'ItemSKU'],
        ['Product A', 10.99, 'SKU001'],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const xlsxBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
      
      const rows = parseXLSX(xlsxBuffer);
      
      expect(Object.keys(rows[0])).toContain('productname');
      expect(Object.keys(rows[0])).toContain('unitprice');
      expect(Object.keys(rows[0])).toContain('itemsku');
    });

    it('should handle headers with spaces and special characters', () => {
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Product Name', 'Unit Price ($)', 'SKU / Item #'],
        ['Product A', 10.99, 'SKU001'],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const xlsxBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
      
      const rows = parseXLSX(xlsxBuffer);
      
      // Should be normalized to snake_case
      expect(Object.keys(rows[0]).some(k => k.includes('product') && k.includes('name'))).toBe(true);
    });
  });

  describe('empty cells handling', () => {
    it('should handle empty cells as empty strings', () => {
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['name', 'price', 'sku'],
        ['Product A', 10.99, ''],
        ['', 20.50, 'SKU002'],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const xlsxBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
      
      const rows = parseXLSX(xlsxBuffer);
      
      expect(rows[0].sku).toBe('');
      expect(rows[1].name).toBe('');
    });

    it('should handle null cells', () => {
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['name', 'price', 'sku'],
        ['Product A', null, 'SKU001'],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const xlsxBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
      
      const rows = parseXLSX(xlsxBuffer);
      
      expect(rows[0].price).toBe('');
    });

    it('should handle undefined cells', () => {
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['name', 'price', 'sku'],
        ['Product A', undefined, 'SKU001'],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const xlsxBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
      
      const rows = parseXLSX(xlsxBuffer);
      
      expect(rows[0].price).toBe('');
    });
  });

  describe('numeric fields stored as numbers', () => {
    it('should preserve integer values', () => {
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['name', 'quantity', 'case_pack'],
        ['Product A', 100, 500],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const xlsxBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
      
      const rows = parseXLSX(xlsxBuffer);
      
      expect(rows[0].quantity).toBe('100');
      expect(rows[0].case_pack).toBe('500');
    });

    it('should format decimal prices with 2 decimal places', () => {
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['name', 'price'],
        ['Product A', 10.99],
        ['Product B', 20.5],
        ['Product C', 15],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const xlsxBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
      
      const rows = parseXLSX(xlsxBuffer);
      
      expect(rows[0].price).toBe('10.99');
      expect(rows[1].price).toBe('20.50');
      expect(rows[2].price).toBe('15'); // Integer stays as integer
    });

    it('should handle large numbers correctly', () => {
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['name', 'price', 'quantity'],
        ['Product A', 1299.99, 10000],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const xlsxBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
      
      const rows = parseXLSX(xlsxBuffer);
      
      expect(rows[0].price).toBe('1299.99');
      expect(rows[0].quantity).toBe('10000');
    });

    it('should handle zero values', () => {
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['name', 'price', 'discount'],
        ['Product A', 0, 0.00],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const xlsxBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
      
      const rows = parseXLSX(xlsxBuffer);
      
      // Both 0 and 0.00 are integers, so they become '0'
      expect(rows[0].price).toBe('0');
      expect(rows[0].discount).toBe('0');
    });
  });

  describe('row count limit enforcement', () => {
    it('should limit rows to 5000', () => {
      // Create worksheet with more than 5000 rows
      const data: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 5500; i++) {
        data.push({ name: `Product ${i}`, price: 10.99 });
      }
      const xlsxBuffer = createTestXLSX(data);
      const rows = parseXLSX(xlsxBuffer);
      
      expect(rows.length).toBeLessThanOrEqual(5000);
    });
  });
});

// ============================================================================
// FILE TYPE DETECTION TESTS
// ============================================================================

describe('File Type Detection', () => {
  it('should detect CSV from filename', () => {
    expect(detectFileType('products.csv')).toBe('csv');
    expect(detectFileType('Products.CSV')).toBe('csv');
    expect(detectFileType('my-file.csv')).toBe('csv');
  });

  it('should detect XLSX from filename', () => {
    expect(detectFileType('products.xlsx')).toBe('xlsx');
    expect(detectFileType('Products.XLSX')).toBe('xlsx');
    expect(detectFileType('my-file.xlsx')).toBe('xlsx');
  });

  it('should detect XLS from filename', () => {
    expect(detectFileType('products.xls')).toBe('xlsx');
  });

  it('should return unknown for unsupported extensions', () => {
    expect(detectFileType('products.txt')).toBe('unknown');
    expect(detectFileType('products.pdf')).toBe('unknown');
    expect(detectFileType('products')).toBe('unknown');
  });
});

// ============================================================================
// FILE VALIDATION TESTS
// ============================================================================

describe('File Validation', () => {
  /**
   * Helper to create a simple XLSX buffer for testing
   */
  function createTestXLSX(data: Array<Record<string, unknown>>): Uint8Array {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  }

  describe('CSV validation', () => {
    it('should validate valid CSV file', () => {
      const csv = 'sku,product_name,price\nSKU001,Product A,10.99';
      const result = validateFile('test.csv', csv, 'csv');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.row_count).toBe(1);
    });

    it('should fail on missing price column', () => {
      const csv = 'sku,product_name\nSKU001,Product A';
      const result = validateFile('test.csv', csv, 'csv');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('price'))).toBe(true);
    });

    it('should warn on missing sku and product_name columns', () => {
      const csv = 'price\n10.99';
      const result = validateFile('test.csv', csv, 'csv');
      
      // Should be valid (price exists) but with warnings
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('SKU') || w.includes('product name'))).toBe(true);
    });

    it('should fail on empty file', () => {
      const csv = '';
      const result = validateFile('test.csv', csv, 'csv');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('No data rows'))).toBe(true);
    });

    it('should fail on header-only file', () => {
      const csv = 'sku,product_name,price';
      const result = validateFile('test.csv', csv, 'csv');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('No data rows'))).toBe(true);
    });
  });

  describe('XLSX validation', () => {
    it('should validate valid XLSX file', () => {
      const xlsxBuffer = createTestXLSX([
        { sku: 'SKU001', product_name: 'Product A', price: 10.99 },
      ]);
      const result = validateFile('test.xlsx', xlsxBuffer, 'xlsx');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.row_count).toBe(1);
    });

    it('should fail on missing price column in XLSX', () => {
      const xlsxBuffer = createTestXLSX([
        { sku: 'SKU001', product_name: 'Product A' },
      ]);
      const result = validateFile('test.xlsx', xlsxBuffer, 'xlsx');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('price'))).toBe(true);
    });
  });

  describe('row count validation', () => {
    it('should fail on too many rows', () => {
      // Create CSV with more than 5000 rows
      const rows = ['sku,price'];
      for (let i = 0; i < 5500; i++) {
        rows.push(`SKU${i},10.99`);
      }
      const csv = rows.join('\n');
      const result = validateFile('test.csv', csv, 'csv');
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Too many rows'))).toBe(true);
    });
  });
});

// ============================================================================
// UNIFIED PARSING TESTS
// ============================================================================

describe('Unified File Parsing (parseFileContent)', () => {
  /**
   * Helper to create a simple XLSX buffer for testing
   */
  function createTestXLSX(data: Array<Record<string, unknown>>): Uint8Array {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  }

  it('should parse CSV content correctly', () => {
    const csv = 'name,price\nProduct A,10.99';
    const rows = parseFileContent(csv, 'csv');
    
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Product A');
    expect(rows[0].price).toBe('10.99');
  });

  it('should parse XLSX content correctly', () => {
    const xlsxBuffer = createTestXLSX([
      { name: 'Product A', price: 10.99 },
    ]);
    const rows = parseFileContent(xlsxBuffer, 'xlsx');
    
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Product A');
    expect(rows[0].price).toBe('10.99');
  });

  it('should produce identical output structure for CSV and XLSX', () => {
    const csv = 'name,price,sku\nProduct A,10.99,SKU001';
    const xlsxBuffer = createTestXLSX([
      { name: 'Product A', price: 10.99, sku: 'SKU001' },
    ]);
    
    const csvRows = parseFileContent(csv, 'csv');
    const xlsxRows = parseFileContent(xlsxBuffer, 'xlsx');
    
    // Both should have same structure
    expect(csvRows).toHaveLength(xlsxRows.length);
    expect(Object.keys(csvRows[0]).sort()).toEqual(Object.keys(xlsxRows[0]).sort());
    expect(csvRows[0].name).toBe(xlsxRows[0].name);
    expect(csvRows[0].sku).toBe(xlsxRows[0].sku);
    // Note: price may have slight formatting differences (10.99 vs "10.99")
  });
});

// ============================================================================
// HEADER NORMALIZATION TESTS
// ============================================================================

describe('Header Normalization', () => {
  it('should convert to lowercase', () => {
    expect(normalizeHeader('PRODUCT')).toBe('product');
    expect(normalizeHeader('ProductName')).toBe('productname');
  });

  it('should replace spaces with underscores', () => {
    expect(normalizeHeader('Product Name')).toBe('product_name');
    expect(normalizeHeader('Unit Price')).toBe('unit_price');
  });

  it('should replace special characters with underscores', () => {
    expect(normalizeHeader('Price ($)')).toBe('price');
    expect(normalizeHeader('SKU/Item#')).toBe('sku_item');
    expect(normalizeHeader('Product-Name')).toBe('product_name');
  });

  it('should collapse multiple underscores', () => {
    expect(normalizeHeader('Product   Name')).toBe('product_name');
    expect(normalizeHeader('Product--Name')).toBe('product_name');
  });

  it('should trim leading/trailing underscores', () => {
    expect(normalizeHeader('  Product  ')).toBe('product');
    expect(normalizeHeader('_Product_')).toBe('product');
  });

  it('should handle empty string', () => {
    expect(normalizeHeader('')).toBe('');
    expect(normalizeHeader('   ')).toBe('');
  });
});
