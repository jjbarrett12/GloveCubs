/**
 * B2B Content Generator for Glove Products
 * Generates complete ecommerce content for GLOVECUBS catalog.
 * 
 * Generates:
 * - SEO title
 * - Subtitle
 * - 5 feature bullets
 * - Long description
 * - Technical specs
 * - Recommended use cases
 * - Search keywords
 * - Meta description
 * 
 * Target audience: janitorial, food service, medical, industrial, safety managers
 */

const { MATERIALS, GRADES, INDUSTRIES, CONFIDENCE_SOURCES } = require('./schema');

const DEFAULT_MODEL = 'gpt-4o-mini';

function getModel() {
  return process.env.OPENAI_MODEL || process.env.AI_MODEL || DEFAULT_MODEL;
}

function isConfigured() {
  return !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

const AUDIENCE_KEYWORDS = {
  janitorial: ['janitorial', 'cleaning', 'sanitation', 'custodial', 'facility maintenance'],
  food_service: ['food service', 'restaurant', 'kitchen', 'food prep', 'culinary'],
  medical: ['medical', 'healthcare', 'clinic', 'exam', 'patient care'],
  industrial: ['industrial', 'manufacturing', 'warehouse', 'general purpose'],
  automotive: ['automotive', 'mechanic', 'garage', 'oil change'],
};

const MATERIAL_BENEFITS = {
  nitrile: {
    benefits: ['Chemical resistant', 'Puncture resistant', 'Latex-free', 'Strong and durable'],
    bestFor: ['Chemical handling', 'Medical exams', 'Food prep', 'General protection'],
  },
  latex: {
    benefits: ['Excellent tactile sensitivity', 'Comfortable fit', 'Elastic and flexible', 'Biodegradable'],
    bestFor: ['Medical procedures', 'Laboratory work', 'Precision tasks'],
  },
  vinyl: {
    benefits: ['Cost-effective', 'Latex-free', 'Loose comfortable fit', 'Easy on/off'],
    bestFor: ['Light-duty tasks', 'Food handling', 'Short-term use'],
  },
  polyethylene: {
    benefits: ['Ultra-economical', 'Loose fit', 'Quick changes', 'Food safe'],
    bestFor: ['Food service', 'Deli counters', 'Quick tasks'],
  },
  neoprene: {
    benefits: ['Chemical resistant', 'Heat resistant', 'Durable', 'Comfortable'],
    bestFor: ['Chemical handling', 'Laboratory work', 'Industrial cleaning'],
  },
};

const GRADE_DESCRIPTIONS = {
  medical_exam: {
    description: 'Medical-grade for healthcare and examination use',
    compliance: 'FDA 510(k) cleared for medical use',
    useCases: ['Patient examinations', 'Medical procedures', 'Laboratory work', 'Dental offices'],
  },
  industrial: {
    description: 'Industrial-grade for general-purpose protection',
    compliance: 'ASTM tested for durability',
    useCases: ['Manufacturing', 'Warehouse work', 'Assembly', 'Maintenance'],
  },
  food_service: {
    description: 'Food-grade for culinary and food handling applications',
    compliance: 'FDA food contact compliant',
    useCases: ['Food preparation', 'Serving', 'Kitchen tasks', 'Catering'],
  },
  janitorial: {
    description: 'Designed for cleaning and sanitation tasks',
    compliance: 'Suitable for cleaning chemicals',
    useCases: ['Janitorial work', 'Facility cleaning', 'Sanitation', 'Restroom maintenance'],
  },
  automotive: {
    description: 'Engineered for automotive and mechanical work',
    compliance: 'Oil and grease resistant',
    useCases: ['Oil changes', 'Mechanical repairs', 'Parts handling', 'Detailing'],
  },
};

/**
 * Generate complete B2B content for a product.
 */
async function generateFullContent(product, options = {}) {
  const { enableAI = true, forceRegenerate = false } = options;
  
  const content = {
    seo_title: null,
    subtitle: null,
    bullet_features: [],
    long_description: null,
    technical_specs: {},
    recommended_use_cases: [],
    search_keywords: [],
    meta_description: null,
    _generated_at: new Date().toISOString(),
    _ai_used: false,
  };
  
  if (enableAI && isConfigured()) {
    const aiContent = await generateContentAI(product);
    if (aiContent) {
      Object.assign(content, aiContent);
      content._ai_used = true;
    } else {
      Object.assign(content, generateContentHeuristic(product));
    }
  } else {
    Object.assign(content, generateContentHeuristic(product));
  }
  
  return content;
}

/**
 * AI-powered content generation.
 */
async function generateContentAI(product) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  
  const model = getModel();
  const materialInfo = MATERIALS[product.material] || {};
  const gradeInfo = GRADES[product.grade] || {};
  
  const prompt = `Generate B2B ecommerce content for this glove product.

PRODUCT DATA (use only these facts):
- Brand: ${product.brand || 'Generic'}
- Material: ${materialInfo.label || product.material || 'Unknown'}
- Thickness: ${product.thickness_mil ? product.thickness_mil + ' mil' : 'Standard'}
- Color: ${product.color || 'Various'}
- Powder: ${product.powder === 'powder_free' ? 'Powder-Free' : product.powder === 'powdered' ? 'Powdered' : 'Not specified'}
- Grade: ${gradeInfo.label || product.grade || 'General Purpose'}
- Pack size: ${product.pack_qty || 100} per box, ${product.case_qty || 1000} per case
- Sizes available: ${Array.isArray(product.size_range) ? product.size_range.join(', ') : 'S-XL'}
- Texture: ${product.texture?.replace(/_/g, ' ') || 'Standard'}
- Cuff: ${product.cuff_style?.replace(/_/g, ' ') || 'Standard'}

TARGET BUYERS: Janitorial companies, food service operations, medical offices, industrial facilities, safety managers

RULES:
1. Do NOT invent specs not provided above
2. Write for business buyers - clear, practical, no fluff
3. Emphasize value: durability, protection, cost-effectiveness
4. Include pack/case quantities in descriptions
5. Only mention FDA/compliance if grade is medical_exam

Generate JSON with these exact fields:
{
  "seo_title": "SEO-optimized title under 70 chars, include brand + material + key differentiator",
  "subtitle": "One-line value proposition, 10-15 words, buyer-focused",
  "bullet_features": ["5 practical feature bullets, 8-12 words each, start with action verb or key benefit"],
  "long_description": "3-4 paragraph description covering: overview, key benefits, applications, and packaging. 150-200 words total.",
  "technical_specs": {
    "Material": "value",
    "Thickness": "value",
    "Color": "value",
    "Powder": "value",
    "Texture": "value",
    "Cuff Style": "value",
    "Pack Quantity": "value",
    "Case Quantity": "value",
    "Sizes": "value"
  },
  "recommended_use_cases": ["4-6 specific use cases with industry context"],
  "search_keywords": ["15-20 B2B search terms buyers would use"],
  "meta_description": "SEO meta description, 150-160 chars, include material + grade + call-to-action"
}

Output ONLY valid JSON.`;

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
          { role: 'system', content: 'You are a B2B product content specialist for industrial safety equipment. Output valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 1200,
      }),
    });
    
    if (!response.ok) {
      console.error('[ContentGen] AI request failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(jsonStr);
    
    if (!parsed.seo_title || !parsed.bullet_features) {
      console.error('[ContentGen] Invalid AI response structure');
      return null;
    }
    
    parsed.technical_specs = buildTechnicalSpecs(product, parsed.technical_specs);
    
    return parsed;
  } catch (err) {
    console.error('[ContentGen] AI generation error:', err.message);
    return null;
  }
}

/**
 * Heuristic-based content generation (no AI).
 */
function generateContentHeuristic(product) {
  const mat = MATERIALS[product.material] || {};
  const matLabel = mat.label || product.material || 'Industrial';
  const gradeInfo = GRADE_DESCRIPTIONS[product.grade] || GRADE_DESCRIPTIONS.industrial;
  const matBenefits = MATERIAL_BENEFITS[product.material] || MATERIAL_BENEFITS.nitrile;
  
  const brandPart = product.brand ? `${product.brand} ` : '';
  const thicknessPart = product.thickness_mil ? ` ${product.thickness_mil} Mil` : '';
  const colorPart = product.color ? ` ${capitalize(product.color)}` : '';
  const powderPart = product.powder === 'powder_free' ? ' Powder-Free' : '';
  
  const seo_title = `${brandPart}${matLabel}${thicknessPart}${colorPart}${powderPart} Gloves`.trim();
  
  const subtitle = `${gradeInfo.description}. Bulk pricing available.`;
  
  const bullet_features = [];
  bullet_features.push(`Made from ${matLabel.toLowerCase()} for ${matBenefits.benefits[0]?.toLowerCase() || 'reliable protection'}`);
  if (product.thickness_mil) {
    bullet_features.push(`${product.thickness_mil} mil thickness provides optimal durability and tactile sensitivity`);
  }
  if (product.powder === 'powder_free') {
    bullet_features.push('Powder-free design reduces contamination and skin irritation');
  }
  bullet_features.push(`Packaged ${product.pack_qty || 100} per box for convenient dispensing`);
  bullet_features.push(`Available in ${product.case_qty || 1000}-count cases for bulk ordering`);
  if (bullet_features.length < 5) {
    bullet_features.push('Ambidextrous design fits either hand for less waste');
  }
  
  const long_description = generateLongDescription(product, matLabel, gradeInfo, matBenefits);
  
  const technical_specs = buildTechnicalSpecs(product);
  
  const recommended_use_cases = gradeInfo.useCases.slice(0, 6);
  
  const search_keywords = generateKeywordsHeuristic(product, matLabel);
  
  const meta_description = `Shop ${brandPart}${matLabel.toLowerCase()} gloves${thicknessPart ? ' -' + thicknessPart : ''}. ${gradeInfo.description}. ${product.pack_qty || 100}/box. Bulk pricing available. Order now.`.substring(0, 160);
  
  return {
    seo_title: seo_title.substring(0, 70),
    subtitle,
    bullet_features: bullet_features.slice(0, 5),
    long_description,
    technical_specs,
    recommended_use_cases,
    search_keywords,
    meta_description,
  };
}

function generateLongDescription(product, matLabel, gradeInfo, matBenefits) {
  const paragraphs = [];
  
  const brandIntro = product.brand ? `${product.brand} ` : 'These ';
  paragraphs.push(`${brandIntro}${matLabel.toLowerCase()} gloves deliver ${matBenefits.benefits.slice(0, 2).join(' and ').toLowerCase()}. ${gradeInfo.description}, these gloves are engineered for demanding professional environments where protection and performance matter.`);
  
  const thicknessLine = product.thickness_mil ? `The ${product.thickness_mil} mil thickness strikes the optimal balance between protection and dexterity. ` : '';
  const powderLine = product.powder === 'powder_free' ? 'Powder-free formulation minimizes contamination risks and reduces skin irritation during extended wear. ' : '';
  const textureLine = product.texture ? `${capitalize(product.texture.replace(/_/g, ' '))} surface provides enhanced grip control. ` : '';
  paragraphs.push(`${thicknessLine}${powderLine}${textureLine}`.trim() || `Designed for comfort and functionality during extended use.`);
  
  paragraphs.push(`Ideal for ${matBenefits.bestFor.slice(0, 3).join(', ').toLowerCase()}, and ${matBenefits.bestFor[3] || 'general protection tasks'}. Whether you're managing a facility, running a kitchen, or overseeing industrial operations, these gloves deliver consistent quality.`);
  
  const packLine = product.pack_qty ? `Each box contains ${product.pack_qty} gloves for easy dispensing. ` : '';
  const caseLine = product.case_qty ? `Order by the case (${product.case_qty} gloves) for maximum value and reduced per-unit cost. ` : '';
  const sizeLine = product.size_range?.length ? `Available in sizes ${product.size_range.join(', ')} to fit your entire team.` : '';
  paragraphs.push(`${packLine}${caseLine}${sizeLine}`.trim());
  
  return paragraphs.join('\n\n');
}

function buildTechnicalSpecs(product, aiSpecs = {}) {
  const specs = {};
  
  const mat = MATERIALS[product.material] || {};
  specs['Material'] = mat.label || product.material || aiSpecs['Material'] || 'N/A';
  
  specs['Thickness'] = product.thickness_mil ? `${product.thickness_mil} mil` : (aiSpecs['Thickness'] || 'Standard');
  
  specs['Color'] = product.color ? capitalize(product.color) : (aiSpecs['Color'] || 'Various');
  
  if (product.powder) {
    specs['Powder'] = product.powder === 'powder_free' ? 'Powder-Free' : 'Powdered';
  }
  
  if (product.texture) {
    specs['Texture'] = capitalize(product.texture.replace(/_/g, ' '));
  }
  
  if (product.cuff_style) {
    specs['Cuff Style'] = capitalize(product.cuff_style.replace(/_/g, ' '));
  }
  
  if (product.sterility) {
    specs['Sterility'] = product.sterility === 'sterile' ? 'Sterile' : 'Non-Sterile';
  }
  
  specs['Pack Quantity'] = product.pack_qty ? `${product.pack_qty} gloves/box` : '100 gloves/box';
  specs['Case Quantity'] = product.case_qty ? `${product.case_qty} gloves/case` : '1,000 gloves/case';
  
  if (product.boxes_per_case) {
    specs['Boxes Per Case'] = product.boxes_per_case;
  }
  
  if (product.size_range?.length) {
    specs['Sizes Available'] = product.size_range.join(', ');
  }
  
  const gradeInfo = GRADES[product.grade];
  if (gradeInfo) {
    specs['Grade'] = gradeInfo.label;
  }
  
  if (product.compliance?.length) {
    specs['Compliance'] = product.compliance.map(c => c.replace(/_/g, ' ').toUpperCase()).join(', ');
  }
  
  return specs;
}

function generateKeywordsHeuristic(product, matLabel) {
  const keywords = new Set();
  
  keywords.add(matLabel.toLowerCase());
  keywords.add(`${matLabel.toLowerCase()} gloves`);
  keywords.add('disposable gloves');
  keywords.add('bulk gloves');
  keywords.add('wholesale gloves');
  
  if (product.brand) {
    keywords.add(product.brand.toLowerCase());
    keywords.add(`${product.brand.toLowerCase()} gloves`);
  }
  
  if (product.color) {
    keywords.add(`${product.color} gloves`);
    keywords.add(`${product.color} ${matLabel.toLowerCase()} gloves`);
  }
  
  if (product.thickness_mil) {
    keywords.add(`${product.thickness_mil} mil gloves`);
    keywords.add(`${product.thickness_mil} mil ${matLabel.toLowerCase()}`);
  }
  
  if (product.powder === 'powder_free') {
    keywords.add('powder free gloves');
    keywords.add('powder-free');
    keywords.add(`powder free ${matLabel.toLowerCase()}`);
  }
  
  const gradeInfo = GRADES[product.grade];
  if (gradeInfo) {
    gradeInfo.keywords?.forEach(k => keywords.add(k));
    keywords.add(`${product.grade.replace(/_/g, ' ')} gloves`);
  }
  
  keywords.add('safety gloves');
  keywords.add('protective gloves');
  keywords.add('work gloves');
  keywords.add('case of gloves');
  keywords.add('box of gloves');
  
  return [...keywords].slice(0, 20);
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Generate content for multiple products in batch.
 */
async function generateBatchContent(products, options = {}) {
  const { enableAI = true, onProgress = null } = options;
  const results = [];
  
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const content = await generateFullContent(product, { enableAI });
    
    results.push({
      product_id: product.id || product.supplier_sku,
      sku: product.supplier_sku,
      content,
    });
    
    if (onProgress) {
      onProgress({ current: i + 1, total: products.length });
    }
    
    if (enableAI && isConfigured() && i < products.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  return results;
}

/**
 * Generate content and format for Supabase products table.
 */
function contentToSupabaseFields(content) {
  return {
    name: content.seo_title,
    description: content.long_description,
    short_description: content.subtitle,
    bullet_features: content.bullet_features,
    attributes: {
      technical_specs: content.technical_specs,
      recommended_use_cases: content.recommended_use_cases,
      meta_description: content.meta_description,
    },
    search_keywords: content.search_keywords,
  };
}

module.exports = {
  generateFullContent,
  generateContentAI,
  generateContentHeuristic,
  generateBatchContent,
  buildTechnicalSpecs,
  contentToSupabaseFields,
  isConfigured,
  MATERIAL_BENEFITS,
  GRADE_DESCRIPTIONS,
  AUDIENCE_KEYWORDS,
};
