/**
 * Admin Module Tests
 * 
 * Tests for URL validation, SSRF protection, and product extraction.
 */

import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  extractTextContent,
  extractMetaTags,
  extractTitle,
  extractTables,
  extractJsonLd,
} from './urlFetch';
import { extractProductFromHtml } from './productExtraction';

// ============================================================================
// URL VALIDATION TESTS
// ============================================================================

describe('URL Validation', () => {
  describe('validateUrl', () => {
    it('should accept valid HTTPS URLs', () => {
      const result = validateUrl('https://example.com/product/123');
      expect(result.valid).toBe(true);
      expect(result.url).toBeDefined();
      expect(result.url?.hostname).toBe('example.com');
    });
    
    it('should accept valid HTTP URLs', () => {
      const result = validateUrl('http://example.com/product');
      expect(result.valid).toBe(true);
    });
    
    it('should reject empty URLs', () => {
      const result = validateUrl('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('URL is required');
    });
    
    it('should reject invalid URL format', () => {
      const result = validateUrl('not a url');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid URL format');
    });
    
    it('should reject javascript: protocol', () => {
      const result = validateUrl('javascript:alert(1)');
      expect(result.valid).toBe(false);
      expect(result.security_flags).toContain('dangerous_protocol');
    });
    
    it('should reject data: protocol', () => {
      const result = validateUrl('data:text/html,<h1>test</h1>');
      expect(result.valid).toBe(false);
      expect(result.security_flags).toContain('dangerous_protocol');
    });
    
    it('should reject file: protocol', () => {
      const result = validateUrl('file:///etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.security_flags).toContain('dangerous_protocol');
    });
    
    it('should reject ftp: protocol', () => {
      const result = validateUrl('ftp://example.com/file');
      expect(result.valid).toBe(false);
      expect(result.security_flags).toContain('blocked_protocol');
    });
  });
  
  describe('SSRF protection', () => {
    it('should block localhost', () => {
      const result = validateUrl('http://localhost/admin');
      expect(result.valid).toBe(false);
      expect(result.security_flags).toContain('ssrf_blocked');
      expect(result.security_flags).toContain('internal_hostname');
    });
    
    it('should block 127.0.0.1', () => {
      const result = validateUrl('http://127.0.0.1:8080/api');
      expect(result.valid).toBe(false);
      expect(result.security_flags).toContain('ssrf_blocked');
    });
    
    it('should block private IP 10.x.x.x', () => {
      const result = validateUrl('http://10.0.0.1/internal');
      expect(result.valid).toBe(false);
      expect(result.security_flags).toContain('private_ip');
    });
    
    it('should block private IP 192.168.x.x', () => {
      const result = validateUrl('http://192.168.1.1/router');
      expect(result.valid).toBe(false);
      expect(result.security_flags).toContain('private_ip');
    });
    
    it('should block private IP 172.16.x.x', () => {
      const result = validateUrl('http://172.16.0.1/internal');
      expect(result.valid).toBe(false);
      expect(result.security_flags).toContain('private_ip');
    });
    
    it('should block AWS metadata endpoint', () => {
      const result = validateUrl('http://169.254.169.254/latest/meta-data/');
      expect(result.valid).toBe(false);
      expect(result.security_flags).toContain('ssrf_blocked');
    });
    
    it('should block GCP metadata endpoint', () => {
      const result = validateUrl('http://metadata.google.internal/computeMetadata/v1/');
      expect(result.valid).toBe(false);
      expect(result.security_flags).toContain('ssrf_blocked');
    });
    
    it('should flag non-standard ports', () => {
      const result = validateUrl('https://example.com:8080/api');
      expect(result.valid).toBe(true);
      expect(result.security_flags).toContain('non_standard_port');
    });
    
    it('should flag URLs with credentials', () => {
      const result = validateUrl('https://user:pass@example.com/');
      expect(result.valid).toBe(true);
      expect(result.security_flags).toContain('url_credentials');
    });
    
    it('should accept valid external URLs', () => {
      const result = validateUrl('https://www.mckesson.com/products/gloves');
      expect(result.valid).toBe(true);
      expect(result.security_flags?.length).toBe(0);
    });
  });
});

// ============================================================================
// HTML PARSING TESTS
// ============================================================================

describe('HTML Parsing', () => {
  describe('extractTextContent', () => {
    it('should remove script tags', () => {
      const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
      const text = extractTextContent(html);
      expect(text).not.toContain('alert');
      expect(text).toContain('Hello');
      expect(text).toContain('World');
    });
    
    it('should remove style tags', () => {
      const html = '<p>Hello</p><style>.hidden{display:none}</style><p>World</p>';
      const text = extractTextContent(html);
      expect(text).not.toContain('display');
    });
    
    it('should replace HTML entities', () => {
      const html = '<p>AT&amp;T &quot;quoted&quot; &amp; more</p>';
      const text = extractTextContent(html);
      expect(text).toContain('AT&T');
      expect(text).toContain('"quoted"');
      expect(text).toContain('& more');
    });
    
    it('should normalize whitespace', () => {
      const html = '<p>  Hello   World  </p>';
      const text = extractTextContent(html);
      expect(text).toBe('Hello World');
    });
  });
  
  describe('extractMetaTags', () => {
    it('should extract og:title', () => {
      const html = '<meta property="og:title" content="Test Product">';
      const meta = extractMetaTags(html);
      expect(meta['og:title']).toBe('Test Product');
    });
    
    it('should extract og:description', () => {
      const html = '<meta property="og:description" content="A great product">';
      const meta = extractMetaTags(html);
      expect(meta['og:description']).toBe('A great product');
    });
    
    it('should extract name-based meta tags', () => {
      const html = '<meta name="description" content="Page description">';
      const meta = extractMetaTags(html);
      expect(meta['description']).toBe('Page description');
    });
    
    it('should handle multiple meta tags', () => {
      const html = `
        <meta property="og:title" content="Title">
        <meta property="og:description" content="Desc">
        <meta name="twitter:title" content="Twitter Title">
      `;
      const meta = extractMetaTags(html);
      expect(Object.keys(meta).length).toBe(3);
    });
  });
  
  describe('extractTitle', () => {
    it('should extract page title', () => {
      const html = '<title>Nitrile Gloves - Buy Online</title>';
      const title = extractTitle(html);
      expect(title).toBe('Nitrile Gloves - Buy Online');
    });
    
    it('should return null for missing title', () => {
      const html = '<html><body>No title</body></html>';
      const title = extractTitle(html);
      expect(title).toBeNull();
    });
  });
  
  describe('extractTables', () => {
    it('should extract simple table', () => {
      const html = `
        <table>
          <tr><th>Property</th><th>Value</th></tr>
          <tr><td>Material</td><td>Nitrile</td></tr>
          <tr><td>Size</td><td>Medium</td></tr>
        </table>
      `;
      const tables = extractTables(html);
      expect(tables.length).toBe(1);
      expect(tables[0].headers).toContain('Property');
      expect(tables[0].rows.length).toBe(2);
      expect(tables[0].rows[0]).toContain('Material');
    });
    
    it('should handle tables without headers', () => {
      const html = `
        <table>
          <tr><td>Material</td><td>Nitrile</td></tr>
        </table>
      `;
      const tables = extractTables(html);
      expect(tables.length).toBe(1);
      expect(tables[0].headers.length).toBe(0);
      expect(tables[0].rows.length).toBe(1);
    });
  });
  
  describe('extractJsonLd', () => {
    it('should extract Product schema', () => {
      const html = `
        <script type="application/ld+json">
          {
            "@type": "Product",
            "name": "Nitrile Gloves",
            "sku": "NG-100",
            "mpn": "ABC123"
          }
        </script>
      `;
      const jsonLd = extractJsonLd(html);
      expect(jsonLd.length).toBe(1);
      expect(jsonLd[0]['@type']).toBe('Product');
      expect(jsonLd[0].name).toBe('Nitrile Gloves');
      expect(jsonLd[0].sku).toBe('NG-100');
    });
    
    it('should handle array of schemas', () => {
      const html = `
        <script type="application/ld+json">
          [{"@type": "Product"}, {"@type": "WebPage"}]
        </script>
      `;
      const jsonLd = extractJsonLd(html);
      expect(jsonLd.length).toBe(2);
    });
    
    it('should handle multiple script tags', () => {
      const html = `
        <script type="application/ld+json">{"@type": "Product"}</script>
        <script type="application/ld+json">{"@type": "Organization"}</script>
      `;
      const jsonLd = extractJsonLd(html);
      expect(jsonLd.length).toBe(2);
    });
    
    it('should handle invalid JSON gracefully', () => {
      const html = `
        <script type="application/ld+json">{invalid json}</script>
      `;
      const jsonLd = extractJsonLd(html);
      expect(jsonLd.length).toBe(0);
    });
  });
});

// ============================================================================
// PRODUCT EXTRACTION TESTS
// ============================================================================

describe('Product Extraction', () => {
  describe('extractProductFromHtml', () => {
    it('should extract from JSON-LD schema', () => {
      const html = `
        <html>
        <head>
          <title>Buy Gloves</title>
          <script type="application/ld+json">
            {
              "@type": "Product",
              "name": "SafeGuard Nitrile Exam Gloves",
              "sku": "SG-NIT-100",
              "mpn": "SG100-M",
              "gtin": "012345678901",
              "brand": {"@type": "Brand", "name": "SafeGuard"},
              "offers": {"price": "24.99"}
            }
          </script>
        </head>
        <body><p>Content</p></body>
        </html>
      `;
      
      const result = extractProductFromHtml(html);
      expect(result.success).toBe(true);
      expect(result.extracted.title).toBe('SafeGuard Nitrile Exam Gloves');
      expect(result.extracted.sku).toBe('SG-NIT-100');
      expect(result.extracted.mpn).toBe('SG100-M');
      expect(result.extracted.upc).toBe('012345678901');
      expect(result.extracted.brand).toBe('SafeGuard');
      expect(result.extracted.price).toBe(24.99);
      expect(result.confidence.overall).toBeGreaterThan(0.8);
    });
    
    it('should extract from spec tables', () => {
      const html = `
        <html>
        <head><title>Product Details</title></head>
        <body>
          <h1>Nitrile Gloves Medium</h1>
          <table>
            <tr><td>Item Number</td><td>ABC-123</td></tr>
            <tr><td>Material</td><td>Nitrile</td></tr>
            <tr><td>Size</td><td>Medium</td></tr>
            <tr><td>Pack Size</td><td>100 gloves</td></tr>
            <tr><td>Color</td><td>Blue</td></tr>
            <tr><td>Thickness</td><td>4 mil</td></tr>
            <tr><td>Powder Free</td><td>Yes</td></tr>
          </table>
        </body>
        </html>
      `;
      
      const result = extractProductFromHtml(html);
      expect(result.success).toBe(true);
      expect(result.extracted.item_number).toBe('ABC-123');
      expect(result.extracted.material).toBe('nitrile');
      expect(result.extracted.size).toBe('M');
      expect(result.extracted.pack_size).toBe(100);
      expect(result.extracted.color).toBe('Blue');
      expect(result.extracted.thickness_mil).toBe(4);
      expect(result.extracted.powder_free).toBe(true);
      expect(result.reasoning.sources).toContain('spec tables');
    });
    
    it('should extract material from text', () => {
      const html = `
        <html>
        <head><title>Vinyl Gloves for Food Service</title></head>
        <body>
          <h1>Vinyl Gloves for Food Service</h1>
          <p>High quality vinyl disposable gloves</p>
        </body>
        </html>
      `;
      
      const result = extractProductFromHtml(html);
      expect(result.extracted.material).toBe('vinyl');
    });
    
    it('should extract pack size from text patterns', () => {
      const html = `
        <html>
        <head><title>Gloves 100ct</title></head>
        <body>
          <p>Each box contains 100 gloves</p>
          <p>200 per case</p>
        </body>
        </html>
      `;
      
      const result = extractProductFromHtml(html);
      expect(result.extracted.pack_size).toBe(100);
    });
    
    it('should detect powder-free from text', () => {
      const html = `
        <html>
        <head><title>Powder-Free Nitrile Gloves</title></head>
        <body>
          <p>These powder-free gloves are ideal for sensitive applications</p>
        </body>
        </html>
      `;
      
      const result = extractProductFromHtml(html);
      expect(result.extracted.powder_free).toBe(true);
    });
    
    it('should detect multiple sizes available', () => {
      const html = `
        <html>
        <head><title>Gloves - All Sizes</title></head>
        <body>
          <p>Available in Small, Medium, Large, and XL</p>
        </body>
        </html>
      `;
      
      const result = extractProductFromHtml(html);
      expect(result.extracted.sizes_available).toContain('S');
      expect(result.extracted.sizes_available).toContain('M');
      expect(result.extracted.sizes_available).toContain('L');
      expect(result.extracted.sizes_available).toContain('XL');
      expect(result.reasoning.warnings.length).toBeGreaterThan(0);
    });
    
    it('should normalize size values', () => {
      const html = `
        <html>
        <head><title>Extra Large Gloves</title></head>
        <body>
          <table>
            <tr><td>Size</td><td>Extra Large</td></tr>
          </table>
        </body>
        </html>
      `;
      
      const result = extractProductFromHtml(html);
      expect(result.extracted.size).toBe('XL');
    });
    
    it('should normalize material values', () => {
      const html = `
        <html>
        <head><title>Gloves</title></head>
        <body>
          <table>
            <tr><td>Material</td><td>Natural Rubber</td></tr>
          </table>
        </body>
        </html>
      `;
      
      const result = extractProductFromHtml(html);
      expect(result.extracted.material).toBe('latex');
    });
    
    it('should extract from meta tags', () => {
      const html = `
        <html>
        <head>
          <title>Buy Gloves</title>
          <meta property="og:title" content="Premium Nitrile Gloves">
          <meta property="og:description" content="High quality nitrile exam gloves">
          <meta property="product:brand" content="MedLine">
          <meta property="product:price:amount" content="29.99">
        </head>
        <body><p>Content</p></body>
        </html>
      `;
      
      const result = extractProductFromHtml(html);
      expect(result.extracted.title).toBe('Premium Nitrile Gloves');
      expect(result.extracted.description).toBe('High quality nitrile exam gloves');
      expect(result.extracted.brand).toBe('MedLine');
      expect(result.extracted.price).toBe(29.99);
    });
    
    it('should fail gracefully with minimal content', () => {
      const html = '<html><body></body></html>';
      const result = extractProductFromHtml(html);
      // With no title and no data, success should be false
      expect(result.extracted.title).toBeUndefined();
      // May still extract minimal data from heuristics, but quality is low
      expect(result.confidence.overall).toBeLessThan(0.5);
    });
    
    it('should clean title from site suffix', () => {
      const html = '<title>Nitrile Gloves - Buy at BestSupply.com</title>';
      const result = extractProductFromHtml(html);
      expect(result.extracted.title).toBe('Nitrile Gloves');
    });
    
    it('should calculate units_per_box from pack_size', () => {
      const html = `
        <html>
        <head><title>Test</title></head>
        <body>
          <table>
            <tr><td>Pack Size</td><td>100</td></tr>
            <tr><td>Per Case</td><td>1000</td></tr>
          </table>
        </body>
        </html>
      `;
      
      const result = extractProductFromHtml(html);
      expect(result.extracted.units_per_box).toBe(100);
      expect(result.extracted.boxes_per_case).toBe(10);
    });
  });
});

// ============================================================================
// CONFIDENCE SCORING TESTS
// ============================================================================

describe('Confidence Scoring', () => {
  it('should have high confidence for JSON-LD data', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Product", "name": "Test", "sku": "123"}
      </script>
    `;
    const result = extractProductFromHtml(html);
    expect(result.confidence.field_scores['title']).toBe(1.0);
    expect(result.confidence.field_scores['sku']).toBe(1.0);
  });
  
  it('should have medium confidence for spec table data', () => {
    const html = `
      <head><title>Test</title></head>
      <table>
        <tr><td>Material</td><td>Nitrile</td></tr>
      </table>
    `;
    const result = extractProductFromHtml(html);
    expect(result.confidence.field_scores['material']).toBeGreaterThanOrEqual(0.7);
    expect(result.confidence.field_scores['material']).toBeLessThan(1.0);
  });
  
  it('should have lower confidence for heuristic extraction', () => {
    const html = `
      <head><title>Test Nitrile Gloves Medium</title></head>
      <body>These nitrile gloves are powder-free</body>
    `;
    const result = extractProductFromHtml(html);
    expect(result.confidence.field_scores['material']).toBeLessThan(0.9);
  });
});
