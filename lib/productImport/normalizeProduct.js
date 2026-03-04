/**
 * Normalize extracted product data into a strict schema with filter attributes.
 * Heuristic inference only; no price. Output uses controlled vocabulary from taxonomy.
 */

const { coerceOne, coerceMany, Taxonomy } = require('../products/taxonomy');

/**
 * Infer filter attributes from name, description, productDetails, specText, bullets.
 * Returns { attributes: {}, warnings: string[] }. Does NOT set price.
 */
function inferAttributesHeuristic(input) {
  const attrs = {};
  const warnings = [];
  const name = (input.name || '').toString();
  const description = (input.description || '').toString();
  const specText = (input.specText || '').toString();
  const bullets = Array.isArray(input.bullets) ? input.bullets : [];
  const pd = input.productDetails && typeof input.productDetails === 'object' ? input.productDetails : {};
  const combined = [name, description, specText, ...bullets].join(' ').toLowerCase();

  // Category
  if (/\bdisposable\b|exam\s*glove|single\s*use\b/.test(combined) && !/\breusable\b|work\s*glove\b/.test(combined)) {
    attrs.category = 'disposable_gloves';
  } else if (/\breusable\b|work\s*glove|heavy\s*duty\s*glove|mechanic/.test(combined)) {
    attrs.category = 'reusable_work_gloves';
  }

  // Material (multi)
  const materials = [];
  if (/\bnitrile\b/.test(combined)) materials.push('nitrile');
  if (/\blatex\b/.test(combined)) materials.push('latex');
  if (/\bvinyl\b|pvc\b/.test(combined)) materials.push('vinyl');
  if (/\bpolyethylene\b|poly\s*ethylene\b|pe\b(?!\s*grade)|pe\s*glove/.test(combined)) materials.push('polyethylene_pe');
  if (materials.length) attrs.material = [...new Set(coerceMany('material', materials))];

  // Size (multi) - from productDetails.sizes or text
  let sizeText = (pd.sizes || pd.size || '').toString() || combined.match(/\b(xs|s|m|l|xl|xxl)\b/gi);
  if (sizeText) {
    const parts = Array.isArray(sizeText) ? sizeText : sizeText.split(/[\s,;\/]+/).map((s) => s.trim());
    const sizes = coerceMany('size', parts);
    if (sizes.length) attrs.size = sizes;
  }

  // Color
  const colorMap = { blue: 'blue', black: 'black', white: 'white', purple: 'purple', orange: 'orange', green: 'green', tan: 'tan', gray: 'gray', grey: 'gray', brown: 'brown', pink: 'pink', yellow: 'yellow', navy: 'navy', red: 'red', 'light blue': 'light_blue' };
  const colorStr = (pd.color || '').toString().toLowerCase() || name.toLowerCase();
  for (const [k, v] of Object.entries(colorMap)) {
    if (colorStr.includes(k) || combined.includes(k)) {
      attrs.color = [v];
      break;
    }
  }

  // Thickness (mil)
  const milMatch = combined.match(/(\d+(?:\.\d+)?)\s*mil|(\d+(?:\.\d+)?)\s*mm|thickness[:\s]*(\d+)/i) || (pd.thickness && pd.thickness.match(/(\d+(?:\.\d+)?)/));
  if (milMatch) {
    const num = parseFloat(milMatch[1] || milMatch[2] || milMatch[3] || milMatch[0]);
    if (num >= 7) attrs.thickness_mil = ['7_plus'];
    else if ([2, 3, 4, 5, 6].includes(Math.round(num))) attrs.thickness_mil = [String(Math.round(num))];
  }

  // Powder
  if (/\bpowder[- ]?free\b|powderfree\b|pf\b(?!\s*glove)/.test(combined) || pd.powder_free === 'Powder-Free') {
    attrs.powder = 'powder_free';
  } else if (/\bpowdered\b/.test(combined)) {
    attrs.powder = 'powdered';
  }

  // Grade
  if (/\b(exam(ination)?|medical)\s*grade\b|exam\s*glove|medical\s*glove|healthcare/.test(combined) || (pd.grade && /exam|medical/i.test(pd.grade))) {
    attrs.grade = 'medical_exam';
  } else if (/\bindustrial\s*grade\b|industrial\s*glove/.test(combined)) {
    attrs.grade = 'industrial';
  } else if (/\bfood\s*service\b|food\s*safe\b|fda\b|haccp\b/.test(combined)) {
    attrs.grade = 'food_service';
  }

  // Industries (multi)
  const industries = [];
  if (/\b(medical|healthcare|hospital|clinic|exam)\b/.test(combined)) industries.push('healthcare');
  if (/\bfood\s*service\b|restaurant\b|hospitality\b/.test(combined)) industries.push('food_service');
  if (/\bfood\s*processing\b|processing\b/.test(combined)) industries.push('food_processing');
  if (/\bjanitorial\b|cleaning\b|janitor\b|custodial\b/.test(combined)) industries.push('janitorial');
  if (/\bsanitation\b|sanitary\b/.test(combined)) industries.push('sanitation');
  if (/\blab(s)?\b|laborator(y|ies)\b/.test(combined)) industries.push('laboratories');
  if (/\bpharmaceutical\b|pharma\b/.test(combined)) industries.push('pharmaceuticals');
  if (/\bbeauty\b|personal\s*care\b|salon\b/.test(combined)) industries.push('beauty_personal_care');
  if (/\btattoo\b|body\s*art\b/.test(combined)) industries.push('tattoo_body_art');
  if (/\bautomotive\b|mechanic\b|auto\b/.test(combined)) industries.push('automotive');
  if (/\beducation\b|school\b/.test(combined)) industries.push('education');
  if (industries.length) attrs.industries = coerceMany('industries', industries);

  // Compliance (multi)
  const compliance = [];
  if (/\bfda\s*approved\b|fda\s*compliant\b/.test(combined)) compliance.push('fda_approved');
  if (/\bastm\b|astm\s*tested\b/.test(combined)) compliance.push('astm_tested');
  if (/\bfood\s*safe\b|food\s*grade\b/.test(combined)) compliance.push('food_safe');
  if (/\blatex[- ]?free\b|latex\s*free\b|nitrile\b/.test(combined) && !/\blatex\s*glove\b/.test(combined)) compliance.push('latex_free');
  if (/\bchemo\b|chemotherapy\b/.test(combined)) compliance.push('chemo_rated');
  if (/\ben\s*455\b|en455\b/.test(combined)) compliance.push('en455');
  if (/\ben\s*374\b|en374\b/.test(combined)) compliance.push('en374');
  if (compliance.length) attrs.compliance = [...new Set(coerceMany('compliance', compliance))];

  // Cut / puncture / abrasion (ANSI)
  const cutM = combined.match(/\b(a[1-9])\b|ansi\s*cut\s*([1-9])/i);
  if (cutM) {
    const a = (cutM[1] || 'a' + cutM[2]).toLowerCase();
    if (Taxonomy.cut_level_ansi.includes(a)) attrs.cut_level_ansi = a;
  }
  const punctureM = combined.match(/\b(p[1-5])\b|puncture\s*([1-5])/i);
  if (punctureM) {
    const p = (punctureM[1] || 'p' + punctureM[2]).toLowerCase();
    if (Taxonomy.puncture_level.includes(p)) attrs.puncture_level = p;
  }
  const abrasionM = combined.match(/\blevel\s*([1-4])\b|abrasion\s*([1-4])/i);
  if (abrasionM) {
    const l = 'level_' + (abrasionM[1] || abrasionM[2]);
    if (Taxonomy.abrasion_level.includes(l)) attrs.abrasion_level = l;
  }

  // Flame resistant
  if (/\bflame\s*resistant\b|fr\b|fire\s*resistant\b/.test(combined)) attrs.flame_resistant = true;

  // Arc rating
  const arcM = combined.match(/\b(category\s*[1-4]|8\s*cal|12\s*cal|20\s*cal)\b/i);
  if (arcM) {
    const arc = arcM[1].toLowerCase().replace(/\s+/, '_');
    const v = Taxonomy.arc_rating.find((a) => a.replace(/_/g, ' ') === arc.replace(/_/g, ' ')) || coerceOne('arc_rating', arc);
    if (v) attrs.arc_rating = [v];
  }

  // Warm/cold
  const warmCold = [];
  if (/\binsulated\b/.test(combined)) warmCold.push('insulated');
  if (/\bwinter\b|cold\s*weather\b/.test(combined)) warmCold.push('winter');
  if (/\bcold\s*weather\b/.test(combined)) warmCold.push('cold_weather');
  if (/\bheated\b/.test(combined)) warmCold.push('heated');
  if (warmCold.length) attrs.warm_cold = coerceMany('warm_cold', warmCold);

  // Texture
  if (/\bfingertip\s*textured\b|textured\s*fingertip\b/.test(combined)) attrs.texture = ['fingertip_textured'];
  else if (/\bfully\s*textured\b|all\s*over\s*textured\b/.test(combined)) attrs.texture = ['fully_textured'];
  else if (/\bsmooth\b/.test(combined)) attrs.texture = ['smooth'];

  // Cuff
  if (/\bbeaded\s*cuff\b|cuff\s*beaded\b/.test(combined)) attrs.cuff_style = ['beaded'];
  else if (/\bextended\s*cuff\b|cuff\s*extended\b/.test(combined)) attrs.cuff_style = ['extended'];
  else if (/\bnon[- ]?beaded\b/.test(combined)) attrs.cuff_style = ['non_beaded'];

  // Hand orientation: default ambidextrous for disposable
  if (attrs.category === 'disposable_gloves' || /\bambidextrous\b|one\s*size\b/.test(combined)) {
    attrs.hand_orientation = 'ambidextrous';
  }

  // Packaging
  const packText = (pd.pack_qty || pd.case_qty || '').toString() + ' ' + combined;
  if (/\b100\s*\/\s*bx\b|100\/box\b|box\s*of\s*100\b/.test(packText)) attrs.packaging = ['box_100'];
  if (/\b(200|250)\s*\/\s*bx\b|box\s*of\s*(200|250)\b/.test(packText)) attrs.packaging = (attrs.packaging || []).concat(['box_200_250']);
  if (/\b1000\s*\/\s*case\b|case\s*of\s*1000\b|10\s*bx\s*\/\s*cs\b/.test(packText)) attrs.packaging = (attrs.packaging || []).concat(['case_1000']);
  if (/\b(2000|2000\+)\b|case\s*of\s*2000\b/.test(packText)) attrs.packaging = (attrs.packaging || []).concat(['case_2000_plus']);
  if (attrs.packaging && attrs.packaging.length) attrs.packaging = coerceMany('packaging', attrs.packaging);

  // Sterility
  if (/\bsterile\b|sterility\b/.test(combined)) attrs.sterility = 'sterile';
  else if (/\bnon[- ]?sterile\b/.test(combined)) attrs.sterility = 'non_sterile';

  if (!attrs.material && (attrs.category === 'disposable_gloves' || name)) warnings.push('Material uncertain');
  if (!attrs.industries || attrs.industries.length === 0) {
    if (attrs.grade === 'medical_exam') warnings.push('Industries could include healthcare');
    else if (attrs.grade === 'food_service') warnings.push('Industries could include food_service, food_processing');
  }

  return { attributes: attrs, warnings };
}

/**
 * Normalize from extracted + specText + bullets into full draft with attributes.
 * Does NOT set price. Images from allowed list only.
 */
function normalizeProduct(extracted, hints, specText = '', bullets = []) {
  const pd = (extracted && extracted.productDetails) || {};
  const meta = (extracted && extracted.meta) || {};
  const jsonld = Array.isArray(extracted && extracted.jsonld) ? extracted.jsonld : [];
  const first = jsonld.find((o) => o && (o['@type'] === 'Product' || o.name || o.sku));
  const text = (extracted && extracted.text) || '';
  const name = meta.title || (first && first.name) || '';
  const description = meta.description || (first && first.description) || text.slice(0, 8000) || '';
  const inputForAttrs = {
    name,
    description,
    specText,
    bullets,
    productDetails: pd,
  };
  const { attributes, warnings } = inferAttributesHeuristic(inputForAttrs);

  const image_urls = (extracted && extracted.image_urls) || [];
  const allowedHints = (hints && (hints.image_urls || hints.images)) || [];
  const allowedSet = new Set([...image_urls, ...allowedHints].filter((u) => typeof u === 'string' && u.trim().startsWith('http')).map((u) => u.trim()));
  const images = Array.from(allowedSet);

  return {
    name: name || null,
    brand: pd.brand || (first && first.brand && (typeof first.brand === 'string' ? first.brand : first.brand.name)) || null,
    sku: (extracted && extracted.sku) || pd.number || (first && first.sku) || null,
    description: description || null,
    images,
    source_url: null,
    attributes,
    warnings,
    source_confidence: {},
  };
}

module.exports = { inferAttributesHeuristic, normalizeProduct };
