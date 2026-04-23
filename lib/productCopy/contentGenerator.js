/**
 * Comprehensive product content generator for GLOVECUBS.
 * Generates SEO titles, descriptions, bullets, specs, and keywords.
 * Designed for B2B buyers: janitorial, food service, medical, industrial.
 */

const MATERIALS = {
  nitrile: {
    benefits: ['latex-free', 'chemical resistant', 'puncture resistant', 'hypoallergenic'],
    useCases: ['medical exams', 'food handling', 'laboratory work', 'automotive repair', 'chemical handling'],
    comparison: 'stronger than latex with better chemical resistance',
  },
  latex: {
    benefits: ['superior elasticity', 'excellent tactile sensitivity', 'biodegradable', 'form-fitting'],
    useCases: ['medical procedures', 'dental work', 'laboratory research', 'cleaning tasks'],
    comparison: 'natural material with unmatched flexibility',
    warning: 'not suitable for latex-sensitive individuals',
  },
  vinyl: {
    benefits: ['latex-free', 'economical', 'loose fit', 'easy on/off'],
    useCases: ['food service', 'light cleaning', 'hair salons', 'non-hazardous tasks'],
    comparison: 'cost-effective for high-volume, low-risk applications',
  },
  polyethylene: {
    benefits: ['ultra-economical', 'loose fit', 'quick changes', 'food safe'],
    useCases: ['food prep', 'deli counters', 'cafeterias', 'general food handling'],
    comparison: 'lowest cost option for basic barrier protection',
  },
  neoprene: {
    benefits: ['chemical resistant', 'durable', 'oil resistant', 'weather resistant'],
    useCases: ['chemical handling', 'oil and gas', 'industrial cleaning', 'maintenance'],
    comparison: 'premium protection for demanding industrial environments',
  },
};

const GRADES = {
  medical_exam: {
    label: 'Medical/Exam Grade',
    compliance: ['FDA 510(k) cleared', 'ASTM D6319 tested'],
    applications: ['patient exams', 'medical procedures', 'clinical settings', 'dental offices'],
  },
  industrial: {
    label: 'Industrial Grade',
    compliance: ['OSHA compliant'],
    applications: ['manufacturing', 'assembly', 'maintenance', 'general industrial'],
  },
  food_service: {
    label: 'Food Service Grade',
    compliance: ['FDA food contact approved', 'HACCP compliant'],
    applications: ['food prep', 'restaurants', 'catering', 'food processing'],
  },
  janitorial: {
    label: 'Janitorial Grade',
    compliance: ['suitable for cleaning chemicals'],
    applications: ['custodial work', 'sanitation', 'facility maintenance', 'housekeeping'],
  },
};

const THICKNESS_BENEFITS = {
  '2': 'ultra-thin for maximum tactile sensitivity',
  '3': 'thin for excellent dexterity in detailed tasks',
  '4': 'standard thickness balancing protection and feel',
  '5': 'medium thickness for extended wear comfort',
  '6': 'heavy-duty protection for demanding tasks',
  '7': 'thick protection for chemical handling',
  '8': 'extra thick for maximum barrier protection',
};

const B2B_AUDIENCES = {
  janitorial: {
    label: 'Janitorial & Custodial',
    concerns: ['chemical resistance', 'durability', 'cost per use', 'all-day comfort'],
    keywords: ['janitorial gloves', 'custodial gloves', 'cleaning gloves', 'facility maintenance'],
  },
  food_service: {
    label: 'Food Service & Restaurants',
    concerns: ['food safety', 'FDA compliance', 'quick changes', 'color coding'],
    keywords: ['food service gloves', 'restaurant gloves', 'food prep gloves', 'food safe'],
  },
  medical: {
    label: 'Medical & Dental Offices',
    concerns: ['barrier protection', 'tactile sensitivity', 'latex-free options', 'exam grade'],
    keywords: ['exam gloves', 'medical gloves', 'clinic gloves', 'dental gloves'],
  },
  industrial: {
    label: 'Industrial & Manufacturing',
    concerns: ['durability', 'grip', 'chemical resistance', 'puncture resistance'],
    keywords: ['industrial gloves', 'manufacturing gloves', 'work gloves', 'safety gloves'],
  },
  safety: {
    label: 'Safety Managers',
    concerns: ['OSHA compliance', 'bulk pricing', 'consistent supply', 'PPE programs'],
    keywords: ['PPE gloves', 'safety supply', 'bulk wholesale', 'facility supply'],
  },
};

function buildSeoTitle(product) {
  const { brand, material, color, thickness, powder, grade, category, subcategory, pack_qty } = product;
  const parts = [];
  
  if (brand) parts.push(brand);
  
  const matLabel = material ? (MATERIALS[material.toLowerCase()]?.label || material) : null;
  if (matLabel) parts.push(matLabel);
  
  if (subcategory && subcategory !== material) {
    parts.push(subcategory);
  } else if (grade && GRADES[grade]) {
    parts.push(GRADES[grade].label.split('/')[0]);
  }
  
  if (category?.toLowerCase().includes('work')) {
    parts.push('Work Gloves');
  } else {
    parts.push('Gloves');
  }
  
  if (thickness) parts.push(`${thickness} Mil`);
  if (color) parts.push(color.charAt(0).toUpperCase() + color.slice(1));
  if (powder === 'powder_free') parts.push('Powder-Free');
  if (pack_qty) parts.push(`${pack_qty}/Box`);
  
  return parts.filter(Boolean).join(' ');
}

function buildSubtitle(product) {
  const { material, grade, pack_qty, case_qty } = product;
  const parts = [];
  
  const matInfo = material ? MATERIALS[material.toLowerCase()] : null;
  if (matInfo) {
    parts.push(matInfo.comparison);
  }
  
  if (grade && GRADES[grade]) {
    parts.push(`for ${GRADES[grade].applications.slice(0, 2).join(' and ')}`);
  }
  
  if (pack_qty && case_qty) {
    parts.push(`— bulk ${pack_qty}/box, ${case_qty}/case`);
  }
  
  const subtitle = parts.join(' ').trim();
  return subtitle.charAt(0).toUpperCase() + subtitle.slice(1);
}

function buildBulletFeatures(product) {
  const { material, color, powder, thickness, sizes, pack_qty, case_qty, grade, subcategory, category } = product;
  const bullets = [];
  
  const matInfo = material ? MATERIALS[material.toLowerCase()] : null;
  if (matInfo) {
    const benefits = matInfo.benefits.slice(0, 3).join(', ');
    bullets.push(`${material.charAt(0).toUpperCase() + material.slice(1)} construction: ${benefits}`);
  }
  
  if (thickness && THICKNESS_BENEFITS[thickness]) {
    bullets.push(`${thickness} mil thickness — ${THICKNESS_BENEFITS[thickness]}`);
  } else if (thickness) {
    bullets.push(`${thickness} mil thickness for optimal protection and dexterity`);
  }
  
  if (powder === 'powder_free') {
    bullets.push('Powder-free formula — no residue, reduces contamination in clean environments');
  } else if (powder === 'powdered') {
    bullets.push('Lightly powdered — easy donning and removal for high-turnover tasks');
  }
  
  if (grade && GRADES[grade]) {
    const gradeInfo = GRADES[grade];
    bullets.push(`${gradeInfo.label}: ${gradeInfo.compliance[0]} for ${gradeInfo.applications[0]}`);
  }
  
  if (color) {
    const colorCap = color.charAt(0).toUpperCase() + color.slice(1);
    if (['blue', 'purple', 'black'].includes(color.toLowerCase())) {
      bullets.push(`${colorCap} color — easy contamination detection for food safety (HACCP)`);
    } else {
      bullets.push(`${colorCap} color — professional appearance for customer-facing roles`);
    }
  }
  
  if (sizes) {
    bullets.push(`Available in ${sizes} — ambidextrous design fits all team members`);
  }
  
  if (pack_qty && case_qty) {
    const boxesPerCase = Math.round(case_qty / pack_qty);
    bullets.push(`Bulk value: ${pack_qty}/box × ${boxesPerCase} boxes/case (${case_qty} gloves/case)`);
  }
  
  if (subcategory?.toLowerCase().includes('cut')) {
    bullets.push('Cut-resistant protection meets ANSI safety standards');
  }
  
  if (category?.toLowerCase().includes('work') || category?.toLowerCase().includes('reusable')) {
    bullets.push('Reusable design — machine washable for lower cost per use');
  }
  
  return bullets.slice(0, 5);
}

function buildLongDescription(product) {
  const { brand, name, material, color, powder, thickness, grade, category, subcategory, pack_qty, case_qty } = product;
  const paragraphs = [];
  
  const productName = name || `${brand || ''} ${material || ''} Gloves`.trim();
  const matInfo = material ? MATERIALS[material.toLowerCase()] : null;
  const gradeInfo = grade ? GRADES[grade] : null;
  
  let intro = `${productName} deliver reliable hand protection for professionals who demand consistency and value.`;
  if (matInfo) {
    intro += ` Constructed from premium ${material.toLowerCase()}, these gloves offer ${matInfo.benefits.slice(0, 2).join(' and ')} performance.`;
  }
  paragraphs.push(intro);
  
  let benefits = '';
  if (thickness) {
    benefits += `At ${thickness} mil, these gloves provide ${THICKNESS_BENEFITS[thickness] || 'optimal protection'}. `;
  }
  if (powder === 'powder_free') {
    benefits += 'The powder-free formula eliminates residue, making them ideal for food handling, cleanroom environments, and users with powder sensitivities. ';
  }
  if (color) {
    benefits += `The ${color} color aids in contamination detection and maintains a professional appearance. `;
  }
  if (benefits) paragraphs.push(benefits.trim());
  
  if (gradeInfo) {
    let gradeText = `These gloves meet ${gradeInfo.label} standards, ${gradeInfo.compliance.join(', ')}. `;
    gradeText += `Perfect for ${gradeInfo.applications.join(', ')}.`;
    paragraphs.push(gradeText);
  }
  
  if (pack_qty && case_qty) {
    const boxesPerCase = Math.round(case_qty / pack_qty);
    let packText = `Packaged ${pack_qty} gloves per box with ${boxesPerCase} boxes per case (${case_qty} total). `;
    packText += 'Bulk packaging ensures you always have supply on hand while reducing per-unit costs.';
    paragraphs.push(packText);
  }
  
  paragraphs.push('GLOVECUBS ships daily to facilities nationwide. Contact us for volume pricing and scheduled delivery options.');
  
  return paragraphs.join('\n\n');
}

function buildTechnicalSpecs(product) {
  const { material, color, powder, thickness, sizes, pack_qty, case_qty, grade, subcategory, brand, sku } = product;
  const specs = {};
  
  if (brand) specs['Brand'] = brand;
  if (sku) specs['SKU'] = sku;
  if (material) specs['Material'] = material.charAt(0).toUpperCase() + material.slice(1);
  if (thickness) specs['Thickness'] = `${thickness} mil`;
  if (color) specs['Color'] = color.charAt(0).toUpperCase() + color.slice(1);
  
  if (powder === 'powder_free') specs['Powder'] = 'Powder-Free';
  else if (powder === 'powdered') specs['Powder'] = 'Powdered';
  
  if (grade && GRADES[grade]) specs['Grade'] = GRADES[grade].label;
  if (subcategory) specs['Type'] = subcategory;
  if (sizes) specs['Sizes Available'] = sizes;
  specs['Hand Orientation'] = 'Ambidextrous';
  
  if (pack_qty) specs['Quantity per Box'] = `${pack_qty} gloves`;
  if (case_qty) {
    specs['Quantity per Case'] = `${case_qty} gloves`;
    if (pack_qty) specs['Boxes per Case'] = Math.round(case_qty / pack_qty);
  }
  
  const matInfo = material ? MATERIALS[material.toLowerCase()] : null;
  if (matInfo) {
    if (matInfo.benefits.includes('latex-free')) specs['Latex'] = 'Latex-Free';
    if (matInfo.benefits.includes('chemical resistant')) specs['Chemical Resistance'] = 'Yes';
    if (matInfo.benefits.includes('food safe')) specs['Food Safe'] = 'Yes';
  }
  
  if (grade === 'food_service') specs['Food Safe'] = 'FDA Compliant';
  if (grade === 'medical_exam') specs['Medical Grade'] = 'FDA 510(k) Cleared';
  
  return specs;
}

function buildUseCases(product) {
  const { material, grade, category, subcategory } = product;
  const useCases = [];
  
  const matInfo = material ? MATERIALS[material.toLowerCase()] : null;
  if (matInfo) {
    useCases.push(...matInfo.useCases.slice(0, 3));
  }
  
  const gradeInfo = grade ? GRADES[grade] : null;
  if (gradeInfo) {
    for (const app of gradeInfo.applications) {
      if (!useCases.includes(app)) useCases.push(app);
    }
  }
  
  const isDisposable = !category?.toLowerCase().includes('work');
  if (isDisposable) {
    const defaults = ['facility maintenance', 'sanitation', 'light-duty tasks'];
    for (const d of defaults) {
      if (!useCases.includes(d)) useCases.push(d);
    }
  } else {
    const defaults = ['manufacturing', 'warehousing', 'assembly', 'material handling'];
    for (const d of defaults) {
      if (!useCases.includes(d)) useCases.push(d);
    }
  }
  
  return useCases.slice(0, 8);
}

function buildSearchKeywords(product) {
  const { brand, material, color, thickness, grade, category, subcategory, powder } = product;
  const keywords = new Set();
  
  const mat = material?.toLowerCase() || '';
  if (mat) {
    keywords.add(`${mat} gloves`);
    keywords.add(`${mat} gloves bulk`);
    keywords.add(`wholesale ${mat} gloves`);
    keywords.add(`${mat} disposable gloves`);
  }
  
  if (brand) {
    keywords.add(`${brand.toLowerCase()} gloves`);
    keywords.add(`${brand.toLowerCase()} ${mat} gloves`);
  }
  
  if (color) {
    keywords.add(`${color} ${mat} gloves`);
    keywords.add(`${color} gloves`);
  }
  
  if (thickness) {
    keywords.add(`${thickness} mil gloves`);
    keywords.add(`${mat} gloves ${thickness} mil`);
  }
  
  if (powder === 'powder_free') {
    keywords.add('powder free gloves');
    keywords.add(`powder free ${mat} gloves`);
  }
  
  if (grade && GRADES[grade]) {
    const gradeInfo = GRADES[grade];
    for (const app of gradeInfo.applications.slice(0, 2)) {
      keywords.add(`${app} gloves`);
    }
  }
  
  for (const audience of Object.values(B2B_AUDIENCES)) {
    for (const kw of audience.keywords.slice(0, 2)) {
      keywords.add(kw);
    }
  }
  
  keywords.add('bulk gloves');
  keywords.add('wholesale gloves');
  keywords.add('case gloves');
  keywords.add('facility supply gloves');
  
  return [...keywords].slice(0, 25);
}

function buildMetaDescription(product) {
  const { brand, material, thickness, pack_qty, case_qty, grade } = product;
  const parts = [];
  
  if (brand) parts.push(brand);
  if (material) parts.push(material.charAt(0).toUpperCase() + material.slice(1));
  parts.push('gloves');
  
  if (thickness) parts.push(`(${thickness} mil)`);
  
  const desc = parts.join(' ');
  
  let meta = `Buy ${desc} in bulk.`;
  
  if (grade && GRADES[grade]) {
    meta += ` ${GRADES[grade].label} for ${GRADES[grade].applications[0]}.`;
  }
  
  if (pack_qty && case_qty) {
    meta += ` ${pack_qty}/box, ${case_qty}/case.`;
  }
  
  meta += ' Fast shipping. Volume discounts. GLOVECUBS wholesale.';
  
  return meta.substring(0, 160);
}

function generateAllContent(product) {
  return {
    seoTitle: buildSeoTitle(product),
    subtitle: buildSubtitle(product),
    bulletFeatures: buildBulletFeatures(product),
    longDescription: buildLongDescription(product),
    technicalSpecs: buildTechnicalSpecs(product),
    useCases: buildUseCases(product),
    searchKeywords: buildSearchKeywords(product),
    metaDescription: buildMetaDescription(product),
  };
}

function generateBatch(products) {
  return products.map((product, index) => ({
    index,
    sku: product.sku || product.supplier_sku,
    ...generateAllContent(product),
  }));
}

module.exports = {
  generateAllContent,
  generateBatch,
  buildSeoTitle,
  buildSubtitle,
  buildBulletFeatures,
  buildLongDescription,
  buildTechnicalSpecs,
  buildUseCases,
  buildSearchKeywords,
  buildMetaDescription,
  MATERIALS,
  GRADES,
  THICKNESS_BENEFITS,
  B2B_AUDIENCES,
};
