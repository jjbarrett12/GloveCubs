/**
 * AI enrichment service for product data.
 * Generates titles, descriptions, keywords when missing.
 * NEVER hallucinates critical data fields.
 */

const { CONFIDENCE_SOURCES, FLAG_TYPES, GRADES, MATERIALS } = require('./schema');

const DEFAULT_MODEL = 'gpt-4o-mini';

function getModel() {
  return process.env.OPENAI_MODEL || process.env.AI_MODEL || DEFAULT_MODEL;
}

function isConfigured() {
  return !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

const STRICT_FIELDS = ['supplier_sku', 'upc', 'supplier_cost', 'images', 'primary_image'];
const AI_GENERATABLE_FIELDS = ['canonical_title', 'short_description', 'long_description', 'bullet_features', 'search_keywords'];
const AI_CLASSIFIABLE_FIELDS = ['category', 'subcategory', 'grade', 'industries'];

async function generateTitle(product) {
  if (!isConfigured()) {
    return generateTitleHeuristic(product);
  }
  
  const apiKey = process.env.OPENAI_API_KEY.trim();
  const model = getModel();
  
  const attributes = {
    brand: product.brand,
    material: product.material ? MATERIALS[product.material]?.label || product.material : null,
    thickness: product.thickness_mil ? `${product.thickness_mil} mil` : null,
    color: product.color,
    powder: product.powder === 'powder_free' ? 'Powder-Free' : product.powder === 'powdered' ? 'Powdered' : null,
    grade: product.grade ? GRADES[product.grade]?.label || product.grade : null,
    pack_qty: product.pack_qty,
    case_qty: product.case_qty,
    category: product.category,
  };
  
  const prompt = `Generate an SEO-optimized B2B product title for gloves.

Input attributes:
${JSON.stringify(attributes, null, 2)}

Rules:
1. Start with brand if provided
2. Include material type
3. Include key differentiators (thickness, powder status)
4. Keep under 80 characters
5. No marketing fluff or excessive punctuation
6. Target search terms buyers would use

Output ONLY the title, no explanation or quotes.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a B2B product catalog specialist for industrial gloves and safety equipment.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 100,
      }),
    });
    
    if (!response.ok) {
      console.error('[AI] Title generation failed:', response.status);
      return { value: generateTitleHeuristic(product).value, confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'heuristic_fallback' };
    }
    
    const data = await response.json();
    const title = data.choices?.[0]?.message?.content?.trim();
    
    if (!title || title.length < 10) {
      return { value: generateTitleHeuristic(product).value, confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'heuristic_fallback' };
    }
    
    return { value: title.replace(/^["']|["']$/g, ''), confidence: CONFIDENCE_SOURCES.AI_GENERATION, source: 'ai' };
  } catch (err) {
    console.error('[AI] Title generation error:', err.message);
    return { value: generateTitleHeuristic(product).value, confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'heuristic_fallback' };
  }
}

function generateTitleHeuristic(product) {
  const parts = [];
  
  if (product.brand) parts.push(product.brand);
  if (product.material) {
    const mat = MATERIALS[product.material]?.label || product.material;
    parts.push(mat);
  }
  if (product.grade && product.grade !== 'industrial') {
    const gradeLabel = GRADES[product.grade]?.label || product.grade;
    parts.push(gradeLabel.replace(' Grade', ''));
  }
  if (product.thickness_mil) parts.push(`${product.thickness_mil} Mil`);
  if (product.color) parts.push(product.color.charAt(0).toUpperCase() + product.color.slice(1));
  if (product.powder === 'powder_free') parts.push('Powder-Free');
  
  if (product.category === 'disposable_gloves') {
    parts.push('Gloves');
  } else if (product.category === 'reusable_work_gloves') {
    parts.push('Work Gloves');
  } else {
    parts.push('Gloves');
  }
  
  const title = parts.join(' ').replace(/\s+/g, ' ').trim();
  return { value: title || 'Industrial Gloves', confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'heuristic' };
}

async function generateDescription(product) {
  if (!isConfigured()) {
    return generateDescriptionHeuristic(product);
  }
  
  const apiKey = process.env.OPENAI_API_KEY.trim();
  const model = getModel();
  
  const prompt = `Generate a product description for B2B buyers.

Product: ${product.canonical_title || 'Industrial Gloves'}
Attributes:
- Material: ${product.material || 'unknown'}
- Thickness: ${product.thickness_mil || 'standard'} mil
- Color: ${product.color || 'various'}
- Powder: ${product.powder || 'unknown'}
- Grade: ${product.grade || 'general purpose'}
- Pack Size: ${product.pack_qty || 100} per box, ${product.case_qty || 1000} per case

Target buyers: janitorial companies, food service, medical clinics, industrial facilities

Write 3-4 sentences covering:
1. Brief overview of the product
2. Key benefits and applications
3. Compliance/certifications ONLY if grade suggests (exam gloves = medical grade)

Do NOT:
- Invent specific certifications not implied by grade
- Include pricing information
- Use excessive marketing language
- Mention UPC, SKU, or ordering codes

Output ONLY the description text.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a B2B product catalog specialist. Write concise, professional descriptions.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 300,
      }),
    });
    
    if (!response.ok) {
      return { value: generateDescriptionHeuristic(product).value, confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'heuristic_fallback' };
    }
    
    const data = await response.json();
    const desc = data.choices?.[0]?.message?.content?.trim();
    
    if (!desc || desc.length < 50) {
      return { value: generateDescriptionHeuristic(product).value, confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'heuristic_fallback' };
    }
    
    return { value: desc, confidence: CONFIDENCE_SOURCES.AI_GENERATION, source: 'ai' };
  } catch (err) {
    console.error('[AI] Description generation error:', err.message);
    return { value: generateDescriptionHeuristic(product).value, confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'heuristic_fallback' };
  }
}

function generateDescriptionHeuristic(product) {
  const mat = product.material ? (MATERIALS[product.material]?.label || product.material) : 'quality';
  const parts = [`High-quality ${mat.toLowerCase()} gloves`];
  
  if (product.color) parts.push(`in ${product.color}`);
  if (product.powder) {
    parts.push(`(${product.powder === 'powder_free' ? 'powder-free' : 'powdered'})`);
  }
  if (product.thickness_mil) parts.push(`with ${product.thickness_mil} mil thickness`);
  
  parts.push('.');
  
  if (product.grade) {
    const gradeLabel = GRADES[product.grade]?.label || product.grade;
    parts.push(`Ideal for ${gradeLabel.toLowerCase().replace(' grade', '')} applications.`);
  }
  
  if (product.pack_qty && product.case_qty) {
    parts.push(`Available in boxes of ${product.pack_qty} with ${product.case_qty} gloves per case.`);
  }
  
  return { value: parts.join(' ').replace(/\s+/g, ' ').trim(), confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'heuristic' };
}

async function generateBulletFeatures(product) {
  if (!isConfigured()) {
    return generateBulletsHeuristic(product);
  }
  
  const apiKey = process.env.OPENAI_API_KEY.trim();
  const model = getModel();
  
  const prompt = `Generate 5-6 bullet point features for this B2B glove product.

Product: ${product.canonical_title || 'Industrial Gloves'}
Material: ${product.material || 'unknown'}
Thickness: ${product.thickness_mil || 'standard'} mil
Grade: ${product.grade || 'general'}
Powder: ${product.powder || 'unknown'}

Rules:
1. Each bullet should be 6-12 words
2. Focus on practical benefits for B2B buyers
3. No fluff or vague claims
4. Only mention compliance if grade indicates (exam = medical)
5. Include durability, comfort, protection aspects

Return as a JSON array of strings, e.g.: ["Feature 1", "Feature 2"]`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a B2B product specialist. Output valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });
    
    if (!response.ok) {
      return generateBulletsHeuristic(product);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    
    try {
      const bullets = JSON.parse(content.replace(/^```json\s*/, '').replace(/\s*```$/, ''));
      if (Array.isArray(bullets) && bullets.length >= 3) {
        return { value: bullets.slice(0, 7), confidence: CONFIDENCE_SOURCES.AI_GENERATION, source: 'ai' };
      }
    } catch (e) {
      // Parse error
    }
    
    return generateBulletsHeuristic(product);
  } catch (err) {
    return generateBulletsHeuristic(product);
  }
}

function generateBulletsHeuristic(product) {
  const bullets = [];
  const mat = product.material ? (MATERIALS[product.material]?.label || product.material) : null;
  
  if (mat) bullets.push(`Made from high-quality ${mat.toLowerCase()} material`);
  if (product.thickness_mil) bullets.push(`${product.thickness_mil} mil thickness for optimal protection`);
  if (product.powder === 'powder_free') bullets.push('Powder-free for sensitive applications');
  if (product.grade === 'medical_exam') bullets.push('Suitable for medical and exam use');
  if (product.grade === 'food_service') bullets.push('Food safe for culinary applications');
  if (product.texture) bullets.push(`${product.texture.replace(/_/g, ' ')} for improved grip`);
  if (product.pack_qty) bullets.push(`Conveniently packaged ${product.pack_qty} per box`);
  
  if (bullets.length < 4) {
    bullets.push('Comfortable fit for extended wear');
    bullets.push('Ambidextrous design fits either hand');
  }
  
  return { value: bullets.slice(0, 6), confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'heuristic' };
}

async function generateKeywords(product) {
  const keywords = new Set();
  
  if (product.material) {
    const mat = MATERIALS[product.material]?.label || product.material;
    keywords.add(mat.toLowerCase());
    keywords.add(`${mat.toLowerCase()} gloves`);
  }
  
  if (product.brand) {
    keywords.add(product.brand.toLowerCase());
    keywords.add(`${product.brand.toLowerCase()} gloves`);
  }
  
  if (product.color) {
    keywords.add(product.color);
    keywords.add(`${product.color} gloves`);
  }
  
  if (product.grade) {
    const gradeKeywords = GRADES[product.grade]?.keywords || [];
    gradeKeywords.forEach(k => keywords.add(k));
    keywords.add(`${product.grade.replace(/_/g, ' ')} gloves`);
  }
  
  if (product.powder === 'powder_free') {
    keywords.add('powder free');
    keywords.add('powder-free gloves');
  }
  
  if (product.thickness_mil) {
    keywords.add(`${product.thickness_mil} mil`);
    keywords.add(`${product.thickness_mil} mil gloves`);
  }
  
  if (product.category === 'disposable_gloves') {
    keywords.add('disposable gloves');
    keywords.add('single use gloves');
  } else if (product.category === 'reusable_work_gloves') {
    keywords.add('work gloves');
    keywords.add('reusable gloves');
  }
  
  keywords.add('bulk gloves');
  keywords.add('wholesale gloves');
  
  return {
    value: [...keywords].slice(0, 20),
    confidence: CONFIDENCE_SOURCES.AI_GENERATION * 0.8,
    source: 'heuristic',
  };
}

async function classifyCategory(product, titleText, descriptionText) {
  const combined = [titleText, descriptionText].filter(Boolean).join(' ').toLowerCase();
  
  if (/\bwork\s*glove|cut\s*resistant|coated|impact|leather|kevlar|reusable\b/.test(combined)) {
    return { value: 'reusable_work_gloves', confidence: CONFIDENCE_SOURCES.REGEX_DESCRIPTION, source: 'text' };
  }
  
  if (/\bdisposable|exam|nitrile|latex|vinyl|single\s*use\b/.test(combined)) {
    return { value: 'disposable_gloves', confidence: CONFIDENCE_SOURCES.REGEX_DESCRIPTION, source: 'text' };
  }
  
  if (product.material && ['nitrile', 'latex', 'vinyl', 'polyethylene'].includes(product.material)) {
    return { value: 'disposable_gloves', confidence: CONFIDENCE_SOURCES.INFERRED_SIMILAR, source: 'material' };
  }
  
  if (product.material && ['leather', 'kevlar', 'hppe_nitrile', 'nylon_nitrile'].includes(product.material)) {
    return { value: 'reusable_work_gloves', confidence: CONFIDENCE_SOURCES.INFERRED_SIMILAR, source: 'material' };
  }
  
  return { value: 'disposable_gloves', confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'default' };
}

async function classifySubcategory(product, titleText, descriptionText) {
  const combined = [titleText, descriptionText].filter(Boolean).join(' ').toLowerCase();
  
  if (/\bcut\s*resistant|ansi\s*a[1-9]/i.test(combined)) {
    return { value: 'Cut Resistant', confidence: CONFIDENCE_SOURCES.REGEX_DESCRIPTION, source: 'text' };
  }
  if (/\bcoated\b|foam\s*nitrile|nitrile\s*coated/.test(combined)) {
    return { value: 'Coated', confidence: CONFIDENCE_SOURCES.REGEX_DESCRIPTION, source: 'text' };
  }
  if (/\bimpact\b|tpr\b/.test(combined)) {
    return { value: 'Impact Resistant', confidence: CONFIDENCE_SOURCES.REGEX_DESCRIPTION, source: 'text' };
  }
  if (/\bexam\b|examination/.test(combined)) {
    return { value: 'Exam Gloves', confidence: CONFIDENCE_SOURCES.REGEX_DESCRIPTION, source: 'text' };
  }
  
  if (product.material) {
    const mat = MATERIALS[product.material]?.label || product.material;
    return { value: mat, confidence: CONFIDENCE_SOURCES.INFERRED_SIMILAR, source: 'material' };
  }
  
  return { value: 'General Purpose', confidence: CONFIDENCE_SOURCES.DEFAULT_VALUE, source: 'default' };
}

async function enrichProduct(product, options = {}) {
  const enriched = { ...product };
  const enrichedFields = [];
  
  if (!enriched.canonical_title || enriched._confidence?.canonical_title < 0.5) {
    const title = await generateTitle(enriched);
    enriched.canonical_title = title.value;
    enriched._confidence = enriched._confidence || {};
    enriched._confidence.canonical_title = title.confidence;
    if (title.source === 'ai') enrichedFields.push('canonical_title');
  }
  
  if (!enriched.short_description) {
    const desc = await generateDescription(enriched);
    enriched.short_description = desc.value.substring(0, 160);
    enriched.long_description = desc.value;
    enriched._confidence.short_description = desc.confidence;
    enriched._confidence.long_description = desc.confidence;
    if (desc.source === 'ai') {
      enrichedFields.push('short_description');
      enrichedFields.push('long_description');
    }
  }
  
  if (!enriched.bullet_features || enriched.bullet_features.length === 0) {
    const bullets = await generateBulletFeatures(enriched);
    enriched.bullet_features = bullets.value;
    enriched._confidence.bullet_features = bullets.confidence;
    if (bullets.source === 'ai') enrichedFields.push('bullet_features');
  }
  
  if (!enriched.search_keywords || enriched.search_keywords.length === 0) {
    const keywords = await generateKeywords(enriched);
    enriched.search_keywords = keywords.value;
    enriched._confidence.search_keywords = keywords.confidence;
  }
  
  if (!enriched.category) {
    const cat = await classifyCategory(enriched, product._raw?.name, product._raw?.description);
    enriched.category = cat.value;
    enriched._confidence.category = cat.confidence;
  }
  
  if (!enriched.subcategory) {
    const sub = await classifySubcategory(enriched, product._raw?.name, product._raw?.description);
    enriched.subcategory = sub.value;
    enriched._confidence.subcategory = sub.confidence;
  }
  
  enriched._enriched_fields = enrichedFields;
  
  if (enrichedFields.length > 0) {
    enriched._flags = enriched._flags || [];
    enriched._flags.push({
      ...FLAG_TYPES.AI_ENRICHED,
      message: `AI-generated fields: ${enrichedFields.join(', ')}`,
      payload: { fields: enrichedFields },
    });
  }
  
  return enriched;
}

module.exports = {
  isConfigured,
  getModel,
  generateTitle,
  generateTitleHeuristic,
  generateDescription,
  generateDescriptionHeuristic,
  generateBulletFeatures,
  generateBulletsHeuristic,
  generateKeywords,
  classifyCategory,
  classifySubcategory,
  enrichProduct,
  STRICT_FIELDS,
  AI_GENERATABLE_FIELDS,
  AI_CLASSIFIABLE_FIELDS,
};
