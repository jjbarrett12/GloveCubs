/**
 * Safe URL Fetching with SSRF Protection
 * 
 * Provides secure HTML fetching for external product URLs with:
 * - URL validation
 * - SSRF protection (blocks private IPs, localhost, internal networks)
 * - Timeout enforcement
 * - Content-type validation
 * - Size limits
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const FETCH_CONFIG = {
  timeout_ms: 10000, // 10 second timeout
  max_content_length: 5 * 1024 * 1024, // 5 MB max
  allowed_protocols: ['https:', 'http:'],
  allowed_content_types: ['text/html', 'application/xhtml+xml'],
  user_agent: 'GloveCubs ProductBot/1.0 (+https://glovecubs.com/bot)',
};

// Private IP ranges to block (SSRF protection)
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // Loopback
  /^10\./,                           // Class A private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // Class B private
  /^192\.168\./,                     // Class C private
  /^169\.254\./,                     // Link-local
  /^0\./,                            // Current network
  /^100\.(6[4-9]|[7-9][0-9]|1[0-2][0-9])\./,  // Carrier-grade NAT
  /^::1$/,                           // IPv6 loopback
  /^fc00:/,                          // IPv6 unique local
  /^fe80:/,                          // IPv6 link-local
  /^fd/,                             // IPv6 private
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'metadata.google.internal',        // GCP metadata
  '169.254.169.254',                 // AWS/Azure metadata
  'metadata.google.com',
];

// ============================================================================
// TYPES
// ============================================================================

export interface UrlValidationResult {
  valid: boolean;
  url?: URL;
  error?: string;
  security_flags?: string[];
}

export interface FetchResult {
  success: boolean;
  html?: string;
  url: string;
  final_url?: string;
  content_type?: string;
  fetch_time_ms?: number;
  error?: string;
  security_blocked?: boolean;
}

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Validate URL for safety before fetching.
 */
export function validateUrl(urlString: string): UrlValidationResult {
  const security_flags: string[] = [];
  
  // Basic format check
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, error: 'URL is required' };
  }
  
  // Trim and check for dangerous prefixes
  const trimmed = urlString.trim();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('file:')) {
    return { valid: false, error: 'Invalid URL protocol', security_flags: ['dangerous_protocol'] };
  }
  
  // Parse URL
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
  
  // Check protocol
  if (!FETCH_CONFIG.allowed_protocols.includes(url.protocol)) {
    return { 
      valid: false, 
      error: `Protocol not allowed: ${url.protocol}`,
      security_flags: ['blocked_protocol'],
    };
  }
  
  // Check for blocked hostnames
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return {
      valid: false,
      error: 'Internal hostname not allowed',
      security_flags: ['ssrf_blocked', 'internal_hostname'],
    };
  }
  
  // Check for private IP ranges
  if (isPrivateIP(hostname)) {
    return {
      valid: false,
      error: 'Private IP addresses not allowed',
      security_flags: ['ssrf_blocked', 'private_ip'],
    };
  }
  
  // Check for IP address in hostname (could bypass DNS-based checks)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    security_flags.push('raw_ip_address');
    // Additional check for the IP
    if (isPrivateIP(hostname)) {
      return {
        valid: false,
        error: 'Private IP addresses not allowed',
        security_flags: ['ssrf_blocked', 'private_ip'],
      };
    }
  }
  
  // Check for suspicious port numbers
  if (url.port && !['80', '443', ''].includes(url.port)) {
    security_flags.push('non_standard_port');
  }
  
  // Check for suspicious URL patterns
  if (url.username || url.password) {
    security_flags.push('url_credentials');
  }
  
  // Check hostname length (prevent buffer overflow attempts)
  if (hostname.length > 255) {
    return { valid: false, error: 'Hostname too long' };
  }
  
  return { valid: true, url, security_flags };
}

/**
 * Check if an IP address is in private ranges.
 */
function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip));
}

// ============================================================================
// SAFE FETCH
// ============================================================================

/**
 * Safely fetch HTML from a URL with SSRF protection.
 */
export async function safeFetchHtml(urlString: string): Promise<FetchResult> {
  const startTime = Date.now();
  
  // Validate URL first
  const validation = validateUrl(urlString);
  if (!validation.valid || !validation.url) {
    return {
      success: false,
      url: urlString,
      error: validation.error,
      security_blocked: true,
    };
  }
  
  const url = validation.url;
  
  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_CONFIG.timeout_ms);
    
    // Perform fetch
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': FETCH_CONFIG.user_agent,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    
    // Check response status
    if (!response.ok) {
      return {
        success: false,
        url: urlString,
        final_url: response.url,
        error: `HTTP error: ${response.status} ${response.statusText}`,
        fetch_time_ms: Date.now() - startTime,
      };
    }
    
    // Check content type
    const contentType = response.headers.get('content-type') || '';
    const isHtml = FETCH_CONFIG.allowed_content_types.some(type => 
      contentType.toLowerCase().includes(type)
    );
    
    if (!isHtml) {
      return {
        success: false,
        url: urlString,
        final_url: response.url,
        content_type: contentType,
        error: `Invalid content type: ${contentType}`,
        fetch_time_ms: Date.now() - startTime,
      };
    }
    
    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > FETCH_CONFIG.max_content_length) {
      return {
        success: false,
        url: urlString,
        final_url: response.url,
        error: `Content too large: ${contentLength} bytes`,
        fetch_time_ms: Date.now() - startTime,
      };
    }
    
    // Read response body with size limit
    const reader = response.body?.getReader();
    if (!reader) {
      return {
        success: false,
        url: urlString,
        error: 'Failed to read response body',
        fetch_time_ms: Date.now() - startTime,
      };
    }
    
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      totalSize += value.length;
      if (totalSize > FETCH_CONFIG.max_content_length) {
        reader.cancel();
        return {
          success: false,
          url: urlString,
          final_url: response.url,
          error: 'Content exceeds size limit',
          fetch_time_ms: Date.now() - startTime,
        };
      }
      
      chunks.push(value);
    }
    
    // Decode HTML
    const decoder = new TextDecoder('utf-8');
    const html = chunks.map(chunk => decoder.decode(chunk, { stream: true })).join('') + decoder.decode();
    
    return {
      success: true,
      html,
      url: urlString,
      final_url: response.url,
      content_type: contentType,
      fetch_time_ms: Date.now() - startTime,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check for abort (timeout)
    if (errorMessage.includes('abort')) {
      return {
        success: false,
        url: urlString,
        error: 'Request timeout',
        fetch_time_ms: Date.now() - startTime,
      };
    }
    
    return {
      success: false,
      url: urlString,
      error: `Fetch failed: ${errorMessage}`,
      fetch_time_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// HTML PARSING UTILITIES
// ============================================================================

/**
 * Extract text content from HTML, removing scripts and styles.
 */
export function extractTextContent(html: string): string {
  // Remove script and style tags
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  
  // Replace common entities
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Remove all tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Extract meta tags from HTML.
 */
export function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  
  // Match meta tags
  const metaRegex = /<meta\s+([^>]*)>/gi;
  let match;
  
  while ((match = metaRegex.exec(html)) !== null) {
    const attributes = match[1];
    
    // Extract name/property and content
    const nameMatch = attributes.match(/(?:name|property)=["']([^"']+)["']/i);
    const contentMatch = attributes.match(/content=["']([^"']+)["']/i);
    
    if (nameMatch && contentMatch) {
      meta[nameMatch[1].toLowerCase()] = contentMatch[1];
    }
  }
  
  return meta;
}

/**
 * Extract page title from HTML.
 */
export function extractTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : null;
}

/**
 * Extract tables from HTML (for spec tables).
 */
export function extractTables(html: string): Array<{ headers: string[]; rows: string[][] }> {
  const tables: Array<{ headers: string[]; rows: string[][] }> = [];
  
  // Match table tags
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableContent = tableMatch[1];
    const headers: string[] = [];
    const rows: string[][] = [];
    
    // Extract header cells
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let thMatch;
    while ((thMatch = thRegex.exec(tableContent)) !== null) {
      headers.push(thMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    
    // Extract rows
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(tableContent)) !== null) {
      const rowContent = trMatch[1];
      const cells: string[] = [];
      
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
        cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
      }
      
      if (cells.length > 0) {
        rows.push(cells);
      }
    }
    
    if (headers.length > 0 || rows.length > 0) {
      tables.push({ headers, rows });
    }
  }
  
  return tables;
}

/**
 * Extract structured data (JSON-LD) from HTML.
 */
export function extractJsonLd(html: string): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  
  const scriptRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const jsonContent = match[1].trim();
      const parsed = JSON.parse(jsonContent);
      
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else {
        results.push(parsed);
      }
    } catch {
      // Invalid JSON, skip
    }
  }
  
  return results;
}
