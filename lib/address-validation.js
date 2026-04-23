/**
 * Address Validation for GLOVECUBS
 * 
 * Validates and normalizes US shipping addresses.
 * Used in checkout flow to ensure complete, valid addresses.
 */

const US_STATES = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia',
  'PR': 'Puerto Rico', 'VI': 'Virgin Islands', 'GU': 'Guam',
  'AS': 'American Samoa', 'MP': 'Northern Mariana Islands'
};

const US_STATE_NAMES_TO_ABBR = {};
for (const [abbr, name] of Object.entries(US_STATES)) {
  US_STATE_NAMES_TO_ABBR[name.toLowerCase()] = abbr;
}

const ZIP_REGEX = /^\d{5}(-\d{4})?$/;
const ZIP_REGEX_LOOSE = /^\d{5}(\s*-?\s*\d{4})?$/;

/**
 * Validate a shipping address.
 * Returns { valid: true, errors: [] } or { valid: false, errors: [...] }
 */
function validateAddress(address) {
  const errors = [];
  
  if (!address || typeof address !== 'object') {
    return { valid: false, errors: [{ field: 'address', message: 'Address is required' }] };
  }
  
  // Full name / contact name
  const fullName = (address.full_name || address.contact_name || '').toString().trim();
  if (!fullName) {
    errors.push({ field: 'full_name', message: 'Contact name is required' });
  } else if (fullName.length < 2) {
    errors.push({ field: 'full_name', message: 'Contact name must be at least 2 characters' });
  }
  
  // Address line 1
  const addressLine1 = (address.address_line1 || address.address || address.street || '').toString().trim();
  if (!addressLine1) {
    errors.push({ field: 'address_line1', message: 'Street address is required' });
  } else if (addressLine1.length < 5) {
    errors.push({ field: 'address_line1', message: 'Street address must be at least 5 characters' });
  }
  
  // City
  const city = (address.city || '').toString().trim();
  if (!city) {
    errors.push({ field: 'city', message: 'City is required' });
  } else if (city.length < 2) {
    errors.push({ field: 'city', message: 'City must be at least 2 characters' });
  }
  
  // State
  const stateRaw = (address.state || '').toString().trim();
  if (!stateRaw) {
    errors.push({ field: 'state', message: 'State is required' });
  } else {
    const stateResult = normalizeState(stateRaw);
    if (!stateResult.valid) {
      errors.push({ field: 'state', message: stateResult.error });
    }
  }
  
  // ZIP code
  const zip = (address.zip_code || address.zip || address.postal_code || '').toString().trim();
  if (!zip) {
    errors.push({ field: 'zip_code', message: 'ZIP code is required' });
  } else if (!ZIP_REGEX.test(zip) && !ZIP_REGEX_LOOSE.test(zip)) {
    errors.push({ field: 'zip_code', message: 'ZIP code must be a valid US format (12345 or 12345-6789)' });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normalize state input to 2-letter abbreviation.
 */
function normalizeState(input) {
  if (!input) {
    return { valid: false, error: 'State is required' };
  }
  
  const trimmed = input.toString().trim();
  const upper = trimmed.toUpperCase();
  
  // Already a valid abbreviation
  if (US_STATES[upper]) {
    return { valid: true, value: upper };
  }
  
  // Try full state name
  const lower = trimmed.toLowerCase();
  if (US_STATE_NAMES_TO_ABBR[lower]) {
    return { valid: true, value: US_STATE_NAMES_TO_ABBR[lower] };
  }
  
  // Try partial match
  for (const [name, abbr] of Object.entries(US_STATE_NAMES_TO_ABBR)) {
    if (name.startsWith(lower) || lower.startsWith(name)) {
      return { valid: true, value: abbr };
    }
  }
  
  return { 
    valid: false, 
    error: `"${trimmed}" is not a valid US state. Use 2-letter abbreviation (e.g., CA, NY, TX)` 
  };
}

/**
 * Normalize ZIP code format.
 */
function normalizeZip(input) {
  if (!input) return null;
  
  const cleaned = input.toString().replace(/\s+/g, '').trim();
  
  // Handle 9-digit ZIP with various formats
  const match9 = cleaned.match(/^(\d{5})-?(\d{4})$/);
  if (match9) {
    return `${match9[1]}-${match9[2]}`;
  }
  
  // Handle 5-digit ZIP
  const match5 = cleaned.match(/^(\d{5})$/);
  if (match5) {
    return match5[1];
  }
  
  return null;
}

/**
 * Normalize an address object.
 * Returns normalized address with consistent field names and formatting.
 */
function normalizeAddress(address) {
  if (!address || typeof address !== 'object') {
    return null;
  }
  
  const fullName = (address.full_name || address.contact_name || '').toString().trim();
  const companyName = (address.company_name || address.company || '').toString().trim();
  const addressLine1 = (address.address_line1 || address.address || address.street || '').toString().trim();
  const addressLine2 = (address.address_line2 || address.apt || address.suite || '').toString().trim();
  const city = (address.city || '').toString().trim();
  const stateRaw = (address.state || '').toString().trim();
  const zipRaw = (address.zip_code || address.zip || address.postal_code || '').toString().trim();
  const phone = (address.phone || '').toString().trim();
  
  const stateResult = normalizeState(stateRaw);
  const state = stateResult.valid ? stateResult.value : stateRaw.toUpperCase().slice(0, 2);
  
  const zip = normalizeZip(zipRaw) || zipRaw;
  
  // Build display string
  const displayParts = [];
  if (fullName) displayParts.push(fullName);
  if (companyName) displayParts.push(companyName);
  if (addressLine1) displayParts.push(addressLine1);
  if (addressLine2) displayParts.push(addressLine2);
  
  const cityStateZip = [city, state, zip].filter(Boolean).join(', ').replace(/, (\d)/, ' $1');
  if (cityStateZip) displayParts.push(cityStateZip);
  
  if (phone) displayParts.push(`Phone: ${phone}`);
  
  return {
    full_name: fullName || null,
    company_name: companyName || null,
    address_line1: addressLine1 || null,
    address_line2: addressLine2 || null,
    city: city || null,
    state: state || null,
    zip_code: zip || null,
    phone: phone || null,
    country: 'US',
    display: displayParts.join('\n')
  };
}

/**
 * Parse a display string back into structured address.
 * Best effort - may not work for all formats.
 */
function parseAddressDisplay(displayString) {
  if (!displayString || typeof displayString !== 'string') {
    return null;
  }
  
  const lines = displayString.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  
  const address = {
    full_name: null,
    company_name: null,
    address_line1: null,
    address_line2: null,
    city: null,
    state: null,
    zip_code: null,
    phone: null
  };
  
  // Look for phone line
  const phoneIdx = lines.findIndex(l => /^phone:/i.test(l));
  if (phoneIdx >= 0) {
    address.phone = lines[phoneIdx].replace(/^phone:\s*/i, '').trim();
    lines.splice(phoneIdx, 1);
  }
  
  // Look for city, state, zip line (usually last non-phone line)
  for (let i = lines.length - 1; i >= 0; i--) {
    const cityStateZipMatch = lines[i].match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(-\d{4})?)$/i);
    if (cityStateZipMatch) {
      address.city = cityStateZipMatch[1].trim();
      address.state = cityStateZipMatch[2].toUpperCase();
      address.zip_code = cityStateZipMatch[3];
      lines.splice(i, 1);
      break;
    }
  }
  
  // First line is usually name
  if (lines.length > 0) {
    address.full_name = lines.shift();
  }
  
  // Next line could be company or address
  if (lines.length > 0) {
    const line = lines[0];
    // If it looks like a street address
    if (/^\d+\s|suite|apt|floor|unit/i.test(line)) {
      address.address_line1 = lines.shift();
    } else if (lines.length > 1) {
      // Assume company name if there are more lines
      address.company_name = lines.shift();
    } else {
      address.address_line1 = lines.shift();
    }
  }
  
  // Remaining line is address
  if (lines.length > 0) {
    if (!address.address_line1) {
      address.address_line1 = lines.shift();
    } else {
      address.address_line2 = lines.shift();
    }
  }
  
  return address;
}

/**
 * Get validation error messages as a single string.
 */
function getErrorMessage(validationResult) {
  if (validationResult.valid) return null;
  return validationResult.errors.map(e => e.message).join('. ');
}

/**
 * Get validation errors grouped by field.
 */
function getErrorsByField(validationResult) {
  if (validationResult.valid) return {};
  const byField = {};
  for (const err of validationResult.errors) {
    byField[err.field] = err.message;
  }
  return byField;
}

module.exports = {
  US_STATES,
  US_STATE_NAMES_TO_ABBR,
  ZIP_REGEX,
  validateAddress,
  normalizeState,
  normalizeZip,
  normalizeAddress,
  parseAddressDisplay,
  getErrorMessage,
  getErrorsByField
};
