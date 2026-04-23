/**
 * Reusable AI prompt templates for batch product content generation.
 * Designed for OpenAI API / GPT-4 batch processing.
 * 
 * Usage:
 *   const prompt = buildPrompt('seo_title', productData);
 *   const response = await callOpenAI(prompt);
 */

const SYSTEM_PROMPT = `You are a B2B ecommerce copywriter for GLOVECUBS, a wholesale supplier of industrial gloves and safety products.

Your audience:
- Janitorial companies purchasing cleaning supplies
- Food service businesses requiring FDA-compliant gloves
- Medical offices and dental clinics needing exam gloves
- Industrial buyers and safety managers managing PPE programs

Writing style:
- Clear, professional, factual
- Emphasize practical benefits: protection, durability, comfort, cost efficiency
- Include pack sizes and quantities when provided
- Never invent specifications not in the source data
- Use B2B language (bulk, wholesale, case quantities, facility supply)
- Avoid consumer marketing fluff`;

const TEMPLATES = {
  seo_title: {
    description: 'Generate an SEO-optimized product title (60-70 chars)',
    prompt: `Generate an SEO-optimized product title for this glove product.

Product attributes:
{{ATTRIBUTES}}

Rules:
1. Start with brand name if provided
2. Include material type (nitrile, latex, vinyl, etc.)
3. Include key differentiators (thickness, color, powder-free)
4. End with product type (Gloves, Exam Gloves, Work Gloves)
5. Keep between 60-70 characters
6. Include "Bulk" or pack size if space allows
7. No special characters or excessive punctuation

Output ONLY the title, nothing else.`,
  },

  subtitle: {
    description: 'Generate a short product subtitle (80-100 chars)',
    prompt: `Generate a short product subtitle/tagline for this glove product.

Product attributes:
{{ATTRIBUTES}}

Rules:
1. One sentence summarizing key benefit
2. Target B2B buyers (not consumers)
3. Mention primary use case or application
4. Include pack size if relevant
5. Keep between 80-100 characters

Output ONLY the subtitle, nothing else.`,
  },

  bullet_features: {
    description: 'Generate 5 bullet point features',
    prompt: `Generate exactly 5 bullet point features for this glove product.

Product attributes:
{{ATTRIBUTES}}

Rules:
1. Each bullet should be 8-15 words
2. Start each with a key feature or benefit
3. Include specific specs when provided (thickness, material properties)
4. One bullet about pack/case quantity
5. Focus on practical B2B benefits:
   - Protection and durability
   - Comfort and fit
   - Compliance (FDA, OSHA, HACCP if applicable)
   - Cost efficiency (bulk value)
   - Applications/use cases
6. Do NOT invent certifications or specs not in the data

Return as a JSON array of 5 strings.
Example: ["Feature 1...", "Feature 2...", "Feature 3...", "Feature 4...", "Feature 5..."]`,
  },

  long_description: {
    description: 'Generate a detailed product description (150-250 words)',
    prompt: `Generate a detailed product description for this glove product.

Product attributes:
{{ATTRIBUTES}}

Structure (4 paragraphs):
1. Opening: Product name and primary benefit (2-3 sentences)
2. Features: Material properties, thickness, powder status (3-4 sentences)
3. Applications: Who uses these and for what tasks (2-3 sentences)
4. Packaging/Ordering: Pack size, case quantity, call to action (2 sentences)

Rules:
- Write for B2B buyers: janitorial, food service, medical, industrial
- Be specific about material benefits (latex-free, chemical resistant, etc.)
- Include compliance/grade information if provided
- Mention pack and case quantities
- End with ordering/shipping message
- Do NOT invent specs, certifications, or compliance claims
- 150-250 words total

Output ONLY the description text.`,
  },

  technical_specs: {
    description: 'Generate technical specifications as key-value pairs',
    prompt: `Generate technical specifications for this glove product.

Product attributes:
{{ATTRIBUTES}}

Include these fields (use "N/A" if not provided):
- Brand
- SKU
- Material
- Thickness
- Color
- Powder Status
- Grade/Type
- Sizes Available
- Hand Orientation (usually "Ambidextrous")
- Quantity per Box
- Quantity per Case
- Boxes per Case
- Latex Status
- Food Safe (if applicable)
- Medical Grade (if applicable)

Return as a JSON object with spec names as keys.
Example: {"Material": "Nitrile", "Thickness": "4 mil", ...}

Only include specs that have data. Do NOT invent values.`,
  },

  use_cases: {
    description: 'Generate recommended use cases/applications',
    prompt: `Generate 6-8 recommended use cases for this glove product.

Product attributes:
{{ATTRIBUTES}}

Consider the material and grade:
- Nitrile: medical exams, chemical handling, automotive, laboratory
- Latex: medical procedures, dental, laboratory, detailed work
- Vinyl: food service, light cleaning, non-hazardous tasks
- Exam grade: patient exams, clinical settings, dental procedures
- Food grade: food prep, restaurants, catering, cafeterias
- Industrial grade: manufacturing, assembly, maintenance

Rules:
1. Return 6-8 specific applications
2. Match use cases to material properties and grade
3. Use professional terminology
4. Include both industry and specific task

Return as a JSON array of strings.
Example: ["Medical examinations", "Food preparation", "Laboratory work", ...]`,
  },

  search_keywords: {
    description: 'Generate search keywords for SEO and catalog',
    prompt: `Generate 15-20 search keywords for this glove product.

Product attributes:
{{ATTRIBUTES}}

Include:
1. Material + "gloves" (e.g., "nitrile gloves")
2. Brand + "gloves" if brand provided
3. Color + material + "gloves"
4. Thickness variations (e.g., "4 mil gloves")
5. Grade-specific terms (e.g., "exam gloves", "food service gloves")
6. B2B terms: "bulk gloves", "wholesale gloves", "case gloves"
7. Industry terms: "janitorial gloves", "medical gloves", "industrial gloves"
8. Use case terms: "cleaning gloves", "food prep gloves"

Return as a JSON array of lowercase strings.
No duplicates. 15-20 total keywords.`,
  },

  meta_description: {
    description: 'Generate SEO meta description (150-160 chars)',
    prompt: `Generate an SEO meta description for this glove product.

Product attributes:
{{ATTRIBUTES}}

Rules:
1. Maximum 160 characters
2. Include: brand, material, key benefit
3. Mention bulk/wholesale
4. Include pack size if space allows
5. End with value proposition (fast shipping, volume pricing)
6. Compelling for search results click-through

Output ONLY the meta description, nothing else.`,
  },

  full_content: {
    description: 'Generate all content fields in one request',
    prompt: `Generate complete ecommerce content for this glove product.

Product attributes:
{{ATTRIBUTES}}

Generate ALL of the following in a single JSON response:

{
  "seoTitle": "SEO title 60-70 chars, brand + material + key features",
  "subtitle": "Short tagline 80-100 chars, key benefit + use case",
  "bulletFeatures": ["Array of 5 bullet points, 8-15 words each"],
  "longDescription": "4-paragraph description, 150-250 words total",
  "technicalSpecs": {"Key": "Value pairs for all specs"},
  "useCases": ["Array of 6-8 applications"],
  "searchKeywords": ["Array of 15-20 keywords"],
  "metaDescription": "SEO meta description, max 160 chars"
}

Rules:
- Target B2B buyers: janitorial, food service, medical, industrial
- Be factual — never invent specs or certifications
- Emphasize: material benefits, pack sizes, durability, applications
- Use professional language, avoid consumer marketing fluff

Return ONLY the JSON object, no markdown or explanation.`,
  },
};

function formatAttributes(product) {
  const lines = [];
  
  if (product.sku || product.supplier_sku) lines.push(`- SKU: ${product.sku || product.supplier_sku}`);
  if (product.brand) lines.push(`- Brand: ${product.brand}`);
  if (product.name || product.canonical_title) lines.push(`- Name: ${product.name || product.canonical_title}`);
  if (product.material) lines.push(`- Material: ${product.material}`);
  if (product.thickness || product.thickness_mil) lines.push(`- Thickness: ${product.thickness || product.thickness_mil} mil`);
  if (product.color) lines.push(`- Color: ${product.color}`);
  if (product.powder) {
    const powderLabel = product.powder === 'powder_free' ? 'Powder-Free' : 
                        product.powder === 'powdered' ? 'Powdered' : product.powder;
    lines.push(`- Powder: ${powderLabel}`);
  }
  if (product.grade) {
    const gradeLabels = {
      medical_exam: 'Medical/Exam Grade',
      industrial: 'Industrial Grade',
      food_service: 'Food Service Grade',
      janitorial: 'Janitorial Grade',
    };
    lines.push(`- Grade: ${gradeLabels[product.grade] || product.grade}`);
  }
  if (product.sizes || product.size_range) {
    const sizes = Array.isArray(product.size_range) ? product.size_range.join(', ') : (product.sizes || product.size_range);
    lines.push(`- Sizes: ${sizes}`);
  }
  if (product.pack_qty) lines.push(`- Pack Quantity: ${product.pack_qty} per box`);
  if (product.case_qty) lines.push(`- Case Quantity: ${product.case_qty} per case`);
  if (product.category) lines.push(`- Category: ${product.category}`);
  if (product.subcategory) lines.push(`- Subcategory: ${product.subcategory}`);
  if (product.description) lines.push(`- Source Description: ${product.description.substring(0, 200)}...`);
  
  return lines.join('\n');
}

function buildPrompt(templateKey, product) {
  const template = TEMPLATES[templateKey];
  if (!template) {
    throw new Error(`Unknown template: ${templateKey}. Available: ${Object.keys(TEMPLATES).join(', ')}`);
  }
  
  const attributes = formatAttributes(product);
  const userPrompt = template.prompt.replace('{{ATTRIBUTES}}', attributes);
  
  return {
    system: SYSTEM_PROMPT,
    user: userPrompt,
    description: template.description,
  };
}

function buildBatchPrompts(products, templateKey = 'full_content') {
  return products.map((product, index) => ({
    index,
    sku: product.sku || product.supplier_sku,
    prompt: buildPrompt(templateKey, product),
  }));
}

async function generateWithAI(product, templateKey = 'full_content', options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const prompt = buildPrompt(templateKey, product);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: options.temperature || 0.3,
      max_tokens: options.maxTokens || 2000,
    }),
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${err}`);
  }
  
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }
  
  if (templateKey === 'full_content' || ['bullet_features', 'technical_specs', 'use_cases', 'search_keywords'].includes(templateKey)) {
    try {
      const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse JSON response:', content.substring(0, 200));
      throw new Error('Invalid JSON response from AI');
    }
  }
  
  return content;
}

async function generateBatchWithAI(products, options = {}) {
  const { concurrency = 3, onProgress = null } = options;
  const results = [];
  
  for (let i = 0; i < products.length; i += concurrency) {
    const batch = products.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (product, j) => {
        try {
          const content = await generateWithAI(product, 'full_content', options);
          return {
            index: i + j,
            sku: product.sku || product.supplier_sku,
            success: true,
            content,
          };
        } catch (err) {
          return {
            index: i + j,
            sku: product.sku || product.supplier_sku,
            success: false,
            error: err.message,
          };
        }
      })
    );
    
    results.push(...batchResults);
    
    if (onProgress) {
      onProgress({ completed: Math.min(i + concurrency, products.length), total: products.length });
    }
    
    if (i + concurrency < products.length) {
      await new Promise(r => setTimeout(r, options.delayMs || 500));
    }
  }
  
  return results;
}

const EXAMPLE_PRODUCT = {
  sku: 'NIT-BLU-4MIL-100',
  brand: 'SafeGuard',
  name: 'SafeGuard Blue Nitrile Exam Gloves',
  material: 'nitrile',
  thickness: '4',
  color: 'blue',
  powder: 'powder_free',
  grade: 'medical_exam',
  sizes: 'S, M, L, XL',
  pack_qty: 100,
  case_qty: 1000,
  category: 'Disposable Gloves',
  subcategory: 'Exam Gloves',
};

const EXAMPLE_OUTPUT = {
  seoTitle: 'SafeGuard Nitrile Exam Gloves 4 Mil Blue Powder-Free 100/Box',
  subtitle: 'Medical-grade protection with superior chemical resistance — 100/box, 1000/case',
  bulletFeatures: [
    'Nitrile construction: latex-free, chemical resistant, hypoallergenic',
    '4 mil thickness — standard protection with excellent tactile sensitivity',
    'Powder-free formula — no residue, ideal for cleanroom and exam use',
    'FDA 510(k) cleared for medical examinations and patient care',
    'Bulk value: 100/box × 10 boxes/case (1000 gloves/case)',
  ],
  longDescription: `SafeGuard Blue Nitrile Exam Gloves deliver reliable barrier protection for medical professionals who demand consistency. Constructed from premium nitrile, these gloves offer latex-free, chemical resistant performance for sensitive applications.

At 4 mil thickness, these gloves provide optimal balance between protection and tactile sensitivity. The powder-free formula eliminates residue, making them ideal for patient exams, laboratory work, and cleanroom environments.

These gloves meet Medical/Exam Grade standards and are FDA 510(k) cleared for patient examinations. Perfect for medical clinics, dental offices, laboratories, and healthcare facilities.

Packaged 100 gloves per box with 10 boxes per case (1000 total). Bulk packaging ensures consistent supply while maximizing cost efficiency. GLOVECUBS ships daily — contact us for volume pricing.`,
  technicalSpecs: {
    Brand: 'SafeGuard',
    SKU: 'NIT-BLU-4MIL-100',
    Material: 'Nitrile',
    Thickness: '4 mil',
    Color: 'Blue',
    Powder: 'Powder-Free',
    Grade: 'Medical/Exam Grade',
    'Sizes Available': 'S, M, L, XL',
    'Hand Orientation': 'Ambidextrous',
    'Quantity per Box': '100 gloves',
    'Quantity per Case': '1000 gloves',
    'Boxes per Case': 10,
    Latex: 'Latex-Free',
    'Medical Grade': 'FDA 510(k) Cleared',
  },
  useCases: [
    'Medical examinations',
    'Patient care',
    'Dental procedures',
    'Laboratory work',
    'Pharmaceutical handling',
    'Clinical settings',
  ],
  searchKeywords: [
    'nitrile gloves', 'nitrile exam gloves', 'blue nitrile gloves', 'powder free nitrile gloves',
    'medical gloves', 'exam gloves', 'latex free gloves', 'safeguard gloves',
    'bulk nitrile gloves', 'wholesale exam gloves', 'case gloves', 'medical exam gloves',
    '4 mil gloves', 'clinic gloves', 'dental gloves', 'laboratory gloves',
  ],
  metaDescription: 'Buy SafeGuard Nitrile Exam Gloves in bulk. FDA-cleared, 4 mil, powder-free. 100/box, 1000/case. Fast shipping, volume discounts.',
};

module.exports = {
  SYSTEM_PROMPT,
  TEMPLATES,
  buildPrompt,
  buildBatchPrompts,
  formatAttributes,
  generateWithAI,
  generateBatchWithAI,
  EXAMPLE_PRODUCT,
  EXAMPLE_OUTPUT,
};
