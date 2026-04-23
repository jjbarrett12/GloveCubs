/**
 * Generate B2B-optimized ecommerce copy for industrial gloves.
 * Output: SEO title, bullet features, long description, technical specs, keywords.
 * Target: janitorial, food service, medical clinics, industrial.
 */

const B2B_SEGMENTS = ['janitorial', 'food service', 'medical', 'industrial'];

function segmentPhrases(category, subcategory, material) {
  const dispos = ['medical clinics', 'dental offices', 'food service', 'restaurants', 'janitorial', 'custodial', 'housekeeping', 'hospitality'];
  const work = ['manufacturing', 'warehousing', 'construction', 'automotive', 'metal fabrication', 'food processing', 'assembly'];
  const isDisposable = (category || '').toLowerCase().includes('disposable');
  return isDisposable ? dispos : work;
}

function buildSeoTitle(product) {
  const { brand, name, material, color, thickness, powder, subcategory, category } = product;
  const parts = [brand];
  if (subcategory && subcategory !== material) parts.push(subcategory);
  else if (material) parts.push(material);
  if (category === 'Work Gloves') parts.push('Work Gloves');
  else parts.push('Gloves');
  if (thickness) parts.push(`${thickness} Mil`);
  if (color) parts.push(color);
  if (powder) parts.push(powder);
  parts.push('| Bulk Wholesale');
  return parts.filter(Boolean).join(' ');
}

function buildBulletFeatures(product) {
  const { material, color, powder, thickness, sizes, pack_qty, case_qty, subcategory, category } = product;
  const bullets = [];

  if (material) {
    if (material.includes('/') || material.includes('Nylon') || material.includes('Leather')) {
      bullets.push(`${material} construction for superior durability and chemical resistance`);
    } else if (material.toLowerCase().includes('latex')) {
      bullets.push(`${material} material — excellent elasticity and tactile sensitivity; powder-free reduces allergens`);
    } else if (material.toLowerCase().includes('vinyl')) {
      bullets.push(`${material} material — economical, latex-free choice for light-duty and food handling`);
    } else {
      bullets.push(`${material} material — latex-free, hypoallergenic, suitable for sensitive skin and food contact`);
    }
  }
  if (powder) {
    bullets.push(`${powder} formula — no residue, ideal for clean environments and food handling`);
  }
  if (thickness) {
    bullets.push(`${thickness} mil thickness — balances protection with tactile sensitivity`);
  }
  if (color) {
    bullets.push(`${color} color — easy detection for safety compliance (e.g., HACCP, food service)`);
  }
  if (sizes) {
    bullets.push(`Available in ${sizes} — ambidextrous fit for all hand sizes`);
  }
  if (pack_qty && case_qty) {
    bullets.push(`Bulk packaging: ${pack_qty} per box, ${case_qty} per case — ideal for facility supply`);
  }
  if (subcategory === 'Cut Resistant') {
    bullets.push('ANSI-rated cut protection — meets occupational safety requirements');
  }
  if (subcategory === 'Coated') {
    bullets.push('Textured grip — excellent wet and dry handling for assembly and material handling');
  }
  if (category === 'Work Gloves') {
    bullets.push('Machine washable and reusable — reduces cost per use for high-volume operations');
  }

  return bullets.slice(0, 6);
}

function buildLongDescription(product) {
  const { brand, name, material, color, powder, thickness, subcategory, category, description } = product;
  const segments = segmentPhrases(category, subcategory, material);
  const segmentStr = segments.slice(0, 4).join(', ');
  const base = description || `${brand} ${name} deliver reliable protection for demanding work environments.`;

  let long = `${base} `;
  if (category === 'Disposable Gloves') {
    long += `Designed for ${segmentStr} professionals who need consistent, hygienic hand protection. `;
  } else {
    long += `Built for ${segmentStr} workers who require durable, day-long comfort. `;
  }
  if (material) long += `The ${material.toLowerCase()} construction provides excellent barrier protection. `;
  if (powder) long += `${powder} design minimizes contamination in clean rooms and food prep areas. `;
  if (thickness) long += `At ${thickness} mil, these gloves offer the right balance of sensitivity and durability. `;
  long += `Order by the case for volume pricing — we ship daily to facilities nationwide.`;
  return long;
}

function buildTechnicalSpecs(product) {
  const { material, color, powder, thickness, sizes, pack_qty, case_qty, subcategory } = product;
  const specs = {};
  if (material) specs.Material = material;
  if (color) specs.Color = color;
  if (powder) specs['Powder Type'] = powder;
  if (thickness) specs['Thickness'] = `${thickness} mil`;
  if (sizes) specs.Sizes = sizes;
  if (pack_qty) specs['Qty per Box'] = pack_qty;
  if (case_qty) specs['Qty per Case'] = case_qty;
  if (subcategory === 'Cut Resistant') specs['ANSI Cut Rating'] = subcategory;
  specs['Hand'] = 'Ambidextrous';
  return specs;
}

function buildKeywords(product) {
  const { brand, material, color, subcategory, category } = product;
  const base = [
    `${material} gloves`,
    `${material} gloves bulk`,
    `wholesale ${material} gloves`,
    `${brand} gloves`,
    ...(color ? [`${color} ${material} gloves`, `${material} gloves ${color}`] : []),
    ...(subcategory ? [`${subcategory} gloves`, `${material} ${subcategory} gloves`] : []),
  ];
  const b2b = [
    'janitorial gloves',
    'food service gloves',
    'medical exam gloves',
    'industrial gloves',
    'bulk gloves wholesale',
    'facility supply gloves',
    'restaurant gloves',
    'clinic gloves',
  ];
  return [...new Set([...base, ...b2b])];
}

/**
 * Generate full product copy for a glove product.
 * @param {object} product - { sku, name, brand, material, color, powder, thickness, sizes, pack_qty, case_qty, category, subcategory, description }
 * @returns {object} { seoTitle, bulletFeatures, longDescription, technicalSpecs, searchKeywords }
 */
function generateProductCopy(product) {
  return {
    seoTitle: buildSeoTitle(product),
    bulletFeatures: buildBulletFeatures(product),
    longDescription: buildLongDescription(product),
    technicalSpecs: buildTechnicalSpecs(product),
    searchKeywords: buildKeywords(product),
  };
}

module.exports = {
  generateProductCopy,
  buildSeoTitle,
  buildBulletFeatures,
  buildLongDescription,
  buildTechnicalSpecs,
  buildKeywords,
};
