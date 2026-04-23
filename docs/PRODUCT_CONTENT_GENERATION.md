# Product Content Generation — GLOVECUBS

## Overview

Scalable system for generating B2B ecommerce product content for bulk glove listings. Supports both rule-based (heuristic) and AI-powered generation.

---

## Content Types Generated

| Content | Purpose | Length |
|---------|---------|--------|
| SEO Title | Product page title, search results | 60-70 chars |
| Subtitle | Product tagline, category pages | 80-100 chars |
| Bullet Features | Quick scan benefits, comparison | 5 bullets, 8-15 words each |
| Long Description | Product detail page, SEO | 150-250 words |
| Technical Specs | Specifications table | Key-value pairs |
| Use Cases | Applications, industries | 6-8 items |
| Search Keywords | SEO, internal search | 15-25 keywords |
| Meta Description | Search engine snippets | 150-160 chars |

---

## Target Audience

| Segment | Key Concerns | Messaging Focus |
|---------|--------------|-----------------|
| **Janitorial** | Chemical resistance, durability, cost | Long-lasting, resistant to cleaners |
| **Food Service** | FDA compliance, quick changes, colors | Food safe, HACCP, contamination detection |
| **Medical Offices** | Barrier protection, tactile sensitivity | Exam grade, FDA cleared, latex-free |
| **Industrial Buyers** | Durability, grip, protection levels | Puncture resistant, ANSI rated |
| **Safety Managers** | Compliance, bulk pricing, consistency | OSHA compliant, volume discounts |

---

## Usage

### Command Line (Heuristic)

```bash
# Generate content from product JSON
node scripts/generate-product-content.js products.json -o content.json

# Output as markdown catalog
node scripts/generate-product-content.js products.json --format markdown -o catalog.md

# Output as CSV for spreadsheet
node scripts/generate-product-content.js products.json --format csv -o content.csv
```

### Command Line (AI)

```bash
# Full content with AI (requires OPENAI_API_KEY)
node scripts/generate-product-content.js products.json --ai -o content.json --verbose

# Generate only specific content type
node scripts/generate-product-content.js products.json --ai --template seo_title
node scripts/generate-product-content.js products.json --ai --template bullet_features
```

### Programmatic (Node.js)

```javascript
// Heuristic generation
const { generateAllContent } = require('./lib/productCopy/contentGenerator');

const product = {
  sku: 'NIT-BLU-4MIL',
  brand: 'SafeGuard',
  material: 'nitrile',
  thickness: '4',
  color: 'blue',
  powder: 'powder_free',
  grade: 'medical_exam',
  pack_qty: 100,
  case_qty: 1000,
};

const content = generateAllContent(product);
console.log(content.seoTitle);
console.log(content.bulletFeatures);

// AI generation
const { generateWithAI } = require('./lib/productCopy/promptTemplates');

const aiContent = await generateWithAI(product, 'full_content');
console.log(aiContent);
```

---

## Input Product Schema

```javascript
{
  // Required
  sku: 'NIT-BLU-4MIL-100',           // Product SKU
  material: 'nitrile',                // nitrile | latex | vinyl | polyethylene | neoprene
  
  // Recommended
  brand: 'SafeGuard',                 // Brand name
  thickness: '4',                     // Thickness in mil (2-20)
  color: 'blue',                      // Product color
  powder: 'powder_free',              // powder_free | powdered
  grade: 'medical_exam',              // medical_exam | industrial | food_service | janitorial
  pack_qty: 100,                      // Gloves per box
  case_qty: 1000,                     // Gloves per case
  
  // Optional
  name: 'SafeGuard Blue Nitrile Gloves',
  sizes: 'S, M, L, XL',               // Available sizes
  category: 'Disposable Gloves',      // Category name
  subcategory: 'Exam Gloves',         // Subcategory name
  description: 'Original description' // Existing description to enhance
}
```

---

## Output Format

### JSON (default)

```json
{
  "sku": "NIT-BLU-4MIL-100",
  "seoTitle": "SafeGuard Nitrile Exam Gloves 4 Mil Blue Powder-Free 100/Box",
  "subtitle": "Medical-grade protection with superior chemical resistance — bulk 100/box",
  "bulletFeatures": [
    "Nitrile construction: latex-free, chemical resistant, hypoallergenic",
    "4 mil thickness — standard protection with excellent tactile sensitivity",
    "Powder-free formula — no residue, ideal for cleanroom and exam use",
    "FDA 510(k) cleared for medical examinations and patient care",
    "Bulk value: 100/box × 10 boxes/case (1000 gloves/case)"
  ],
  "longDescription": "SafeGuard Blue Nitrile Exam Gloves deliver reliable...",
  "technicalSpecs": {
    "Brand": "SafeGuard",
    "Material": "Nitrile",
    "Thickness": "4 mil",
    "Color": "Blue",
    "Powder": "Powder-Free",
    "Grade": "Medical/Exam Grade",
    "Sizes Available": "S, M, L, XL",
    "Hand Orientation": "Ambidextrous",
    "Quantity per Box": "100 gloves",
    "Quantity per Case": "1000 gloves"
  },
  "useCases": [
    "Medical examinations",
    "Patient care",
    "Dental procedures",
    "Laboratory work"
  ],
  "searchKeywords": [
    "nitrile gloves",
    "exam gloves",
    "blue nitrile gloves",
    "powder free gloves"
  ],
  "metaDescription": "Buy SafeGuard Nitrile Exam Gloves in bulk. FDA-cleared, 4 mil, powder-free. 100/box, 1000/case. Fast shipping."
}
```

---

## AI Prompt Templates

### Available Templates

| Template | Description | Output |
|----------|-------------|--------|
| `seo_title` | SEO-optimized title | String |
| `subtitle` | Short product tagline | String |
| `bullet_features` | 5 feature bullets | Array of strings |
| `long_description` | Full product description | String |
| `technical_specs` | Specifications table | Object |
| `use_cases` | Recommended applications | Array of strings |
| `search_keywords` | SEO keywords | Array of strings |
| `meta_description` | SEO meta description | String |
| `full_content` | All content in one call | Object |

### Custom Prompts

```javascript
const { buildPrompt, SYSTEM_PROMPT } = require('./lib/productCopy/promptTemplates');

// Get the formatted prompt for any template
const prompt = buildPrompt('bullet_features', product);
console.log(prompt.system);  // System prompt
console.log(prompt.user);    // User prompt with product data

// Use with your own AI client
const response = await yourAIClient.chat({
  messages: [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user }
  ]
});
```

---

## Content Rules

### DO

- ✅ Emphasize pack sizes and bulk value
- ✅ Include material benefits (latex-free, chemical resistant)
- ✅ Mention compliance when grade supports it (FDA, OSHA)
- ✅ Use B2B language (facility supply, wholesale, case pricing)
- ✅ Include specific measurements (4 mil, 100/box)
- ✅ Target practical applications and use cases

### DON'T

- ❌ Invent specifications not in source data
- ❌ Claim certifications without grade support
- ❌ Use consumer marketing language ("amazing", "best ever")
- ❌ Make unsupported compliance claims
- ❌ Include pricing in content
- ❌ Use excessive punctuation or emoji

---

## Material-Specific Content

### Nitrile

```
Benefits: latex-free, chemical resistant, puncture resistant, hypoallergenic
Use cases: medical exams, food handling, laboratory work, automotive repair
Comparison: stronger than latex with better chemical resistance
```

### Latex

```
Benefits: superior elasticity, excellent tactile sensitivity, biodegradable
Use cases: medical procedures, dental work, laboratory research
Warning: not suitable for latex-sensitive individuals
```

### Vinyl

```
Benefits: latex-free, economical, loose fit, easy on/off
Use cases: food service, light cleaning, non-hazardous tasks
Comparison: cost-effective for high-volume, low-risk applications
```

### Polyethylene

```
Benefits: ultra-economical, loose fit, quick changes, food safe
Use cases: food prep, deli counters, cafeterias
Comparison: lowest cost option for basic barrier protection
```

---

## Grade-Specific Messaging

### Medical/Exam Grade

- FDA 510(k) cleared
- ASTM D6319 tested
- Applications: patient exams, clinical settings, dental offices

### Industrial Grade

- OSHA compliant
- Applications: manufacturing, assembly, maintenance

### Food Service Grade

- FDA food contact approved
- HACCP compliant
- Applications: food prep, restaurants, catering

---

## Batch Processing

### Large CSV Import

```bash
# 1. Convert CSV to JSON
node scripts/ingest-products.js products.csv --output products.json

# 2. Generate content
node scripts/generate-product-content.js products.json --ai -o content.json --verbose

# 3. Merge content back to products
# (manual step or custom script)
```

### Rate Limiting for AI

```javascript
const results = await generateBatchWithAI(products, {
  concurrency: 3,        // Parallel requests
  delayMs: 500,          // Delay between batches
  onProgress: ({ completed, total }) => {
    console.log(`${completed}/${total}`);
  }
});
```

---

## Files

| File | Purpose |
|------|---------|
| `lib/productCopy/contentGenerator.js` | Heuristic content generation |
| `lib/productCopy/promptTemplates.js` | AI prompt templates |
| `lib/productCopy/gloveDescriptions.js` | Legacy content generator |
| `scripts/generate-product-content.js` | CLI tool |
