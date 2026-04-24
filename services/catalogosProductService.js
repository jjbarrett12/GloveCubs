/**
 * CatalogService — sole write boundary for catalogos.products / product_attributes / product_images.
 * Facet keys in products.attributes are derived via DB trigger + catalogos.merge_product_attribute_facets (no duplicate facet writes here).
 */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { normalizeCanonicalUuidInput } = require('../lib/resolve-canonical-product-id');
const { resolveCatalogV2ProductId } = require('../lib/resolve-catalog-v2-product-id');

const COS = 'catalogos';

/** catalogos.products.id -> catalog_v2.catalog_products.id (successes only; failures are not cached). */
const catalogV2IdByListingId = new Map();
/** listing id -> already logged warn for unmapped (cleared when mapping succeeds). */
const catalogV2UnmappedListingLogged = new Set();

const PRODUCT_SELECT = `
  id, sku, name, slug, description, attributes, is_active, published_at, category_id, brand_id, manufacturer_id, created_at, updated_at,
  categories ( name, slug ),
  brands ( name ),
  product_images ( url, sort_order )
`;

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || ''));
}

function slugFromName(name) {
  const raw = (name || '').toString().trim();
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '';
}

/** Map UI labels like "Disposable Gloves" to category slug "disposable-gloves". */
function slugFromCategoryLabel(label) {
  return slugFromName(label);
}

/**
 * Resolve storefront category filter (slug or human-readable name) to catalogos.categories.id.
 * @param {object} supabase - Supabase admin client
 * @param {string|undefined|null} category
 * @returns {Promise<string|null>}
 */
async function resolveCategoryIdForProductFilter(supabase, category) {
  const raw = (category || '').toString().trim();
  if (!raw) return null;
  const { data: byExactSlug } = await supabase.schema(COS).from('categories').select('id').eq('slug', raw).maybeSingle();
  if (byExactSlug?.id) return String(byExactSlug.id);
  const guessed = slugFromCategoryLabel(raw);
  if (guessed && guessed !== raw) {
    const { data: byGuessedSlug } = await supabase.schema(COS).from('categories').select('id').eq('slug', guessed).maybeSingle();
    if (byGuessedSlug?.id) return String(byGuessedSlug.id);
  }
  const { data: byName } = await supabase.schema(COS).from('categories').select('id').ilike('name', raw).limit(1).maybeSingle();
  if (byName?.id) return String(byName.id);
  return null;
}

function rowToProduct(row) {
  if (!row) return null;
  const r = row;
  const attrs = r.attributes && typeof r.attributes === 'object' ? r.attributes : {};
  const listPrice = attrs.list_price != null ? Number(attrs.list_price) : attrs.retail_price != null ? Number(attrs.retail_price) : null;
  const unitCost = attrs.unit_cost != null ? Number(attrs.unit_cost) : attrs.cost != null ? Number(attrs.cost) : null;
  const bulkPrice = attrs.bulk_price != null ? Number(attrs.bulk_price) : null;
  return {
    id: r.id,
    sku: r.sku,
    name: r.name || '',
    brand: r.brand || '',
    supplier_name: r.brand || '',
    category: r.category || '',
    subcategory: r.subcategory || '',
    description: r.description || '',
    material: r.material || '',
    sizes: r.sizes || '',
    color: r.color || '',
    pack_qty: r.pack_qty ?? null,
    case_qty: r.case_qty ?? null,
    list_price: listPrice,
    price: listPrice != null ? listPrice : unitCost != null ? Number(unitCost) : 0,
    bulk_price: bulkPrice,
    cost: unitCost,
    image_url: r.image_url || '',
    images: Array.isArray(r.images) ? r.images : [],
    in_stock: r.in_stock != null ? r.in_stock : r.is_active === false ? 0 : 1,
    /** Listing row id (catalogos.products.id); same as id. Cart sends this for listing resolution. */
    listing_id: r.id != null ? String(r.id) : undefined,
    /** @deprecated Misnomer: equals listing UUID. Prefer listing_id + catalog_v2_product_id. */
    canonical_product_id: r.id != null ? String(r.id) : undefined,
    /** catalog_v2.catalog_products.id — stock / public.inventory.canonical_product_id. Filled by attachCatalogV2ProductId. */
    catalog_v2_product_id: undefined,
    featured: r.featured != null ? r.featured : 0,
    powder: r.powder || '',
    thickness: r.thickness ?? null,
    grade: r.grade || '',
    useCase: r.use_case || r.useCase || '',
    certifications: r.certifications || '',
    texture: r.texture || '',
    cuffStyle: r.cuff_style || r.cuffStyle || '',
    sterility: r.sterility || '',
    video_url: r.video_url || '',
    manufacturer_id: r.manufacturer_id ?? null,
    attributes: attrs,
    slug: r.slug || null,
    industry_tags: r.industry_tags || [],
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function mapJoinedRow(p, cat, brand, images, attrMap) {
  const m = attrMap || {};
  const imgRows = (images || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const urls = imgRows.map((i) => i.url).filter(Boolean);
  const attrs = p.attributes && typeof p.attributes === 'object' ? { ...p.attributes } : {};
  return {
    ...p,
    brand: brand?.name || attrs.merch_brand || '',
    category: cat?.name || '',
    subcategory: m.subcategory || attrs.subcategory || '',
    material: m.material || attrs.material || '',
    color: m.color || attrs.color || '',
    sizes: m.size || m.sizes || attrs.sizes || '',
    powder: m.powder || attrs.powder || '',
    thickness: m.thickness || attrs.thickness || '',
    grade: m.grade || attrs.grade || '',
    use_case: m.use_case || attrs.use_case || '',
    certifications: m.certifications || attrs.certifications || '',
    texture: m.texture || attrs.texture || '',
    cuff_style: m.cuff_style || attrs.cuff_style || '',
    sterility: m.sterility || attrs.sterility || '',
    video_url: m.video_url || attrs.video_url || '',
    featured: attrs.featured != null ? attrs.featured : 0,
    pack_qty: attrs.pack_qty ?? null,
    case_qty: attrs.case_qty ?? null,
    industry_tags: attrs.industry_tags || [],
    image_url: urls[0] || '',
    images: urls,
    in_stock: p.is_active === false ? 0 : 1,
    category_slug: cat?.slug,
  };
}

async function resolveDefaultCategoryId(supabase) {
  const { data, error } = await supabase
    .schema(COS)
    .from('categories')
    .select('id')
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('catalogos.categories is empty; seed at least one category before creating products.');
  return data.id;
}

async function resolveCategoryId(supabase, payload) {
  if (payload.category_id && isUuid(payload.category_id)) return String(payload.category_id);
  const slugOrName = (payload.category || '').toString().trim();
  if (slugOrName) {
    const { data, error } = await supabase
      .schema(COS)
      .from('categories')
      .select('id')
      .or(`slug.ilike.%${slugOrName}%,name.ilike.%${slugOrName}%`)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return String(data.id);
  }
  return resolveDefaultCategoryId(supabase);
}

async function resolveBrandId(supabase, brandName) {
  const n = (brandName || '').toString().trim();
  if (!n) return null;
  const { data: existing } = await supabase.schema(COS).from('brands').select('id').ilike('name', n).limit(1).maybeSingle();
  if (existing?.id) return existing.id;
  const slug = slugFromName(n) || 'brand';
  const { data: inserted, error } = await supabase
    .schema(COS)
    .from('brands')
    .insert({ name: n, slug: `${slug}-${Date.now().toString(36)}` })
    .select('id')
    .single();
  if (error) throw error;
  return inserted.id;
}

async function loadAttributeDefinitions(supabase, categoryId) {
  const { data, error } = await supabase
    .schema(COS)
    .from('attribute_definitions')
    .select('id, attribute_key')
    .eq('category_id', categoryId);
  if (error) throw error;
  const byKey = new Map();
  for (const d of data || []) {
    if (d.attribute_key) byKey.set(String(d.attribute_key).toLowerCase(), d.id);
  }
  return byKey;
}

function mergeMerchIntoAttributesJson(payload, existingAttrs) {
  const base = existingAttrs && typeof existingAttrs === 'object' ? { ...existingAttrs } : {};
  const fromPayload = payload.attributes && typeof payload.attributes === 'object' ? { ...payload.attributes } : {};
  const out = { ...base, ...fromPayload };
  if (payload.price !== undefined) out.list_price = payload.price;
  if (payload.cost !== undefined) out.unit_cost = payload.cost;
  if (payload.bulk_price !== undefined) out.bulk_price = payload.bulk_price;
  if (payload.pack_qty !== undefined) out.pack_qty = payload.pack_qty;
  if (payload.case_qty !== undefined) out.case_qty = payload.case_qty;
  if (payload.featured !== undefined) out.featured = payload.featured;
  if (payload.attribute_warnings) out.attribute_warnings = payload.attribute_warnings;
  if (payload.source_confidence) out.source_confidence = payload.source_confidence;
  if (payload.brand) out.merch_brand = payload.brand;
  return out;
}

async function syncProductAttributes(supabase, productId, categoryId, payload) {
  const defs = await loadAttributeDefinitions(supabase, categoryId);
  const pairs = [
    ['material', payload.material],
    ['color', payload.color],
    ['size', payload.sizes || payload.size],
    ['thickness', payload.thickness],
    ['powder', payload.powder],
    ['grade', payload.grade],
    ['category', payload.category],
    ['subcategory', payload.subcategory],
    ['use_case', payload.useCase || payload.use_case],
  ];
  for (const [key, val] of pairs) {
    const defId = defs.get(key.toLowerCase());
    if (!defId) continue;
    const text = val != null && String(val).trim() !== '' ? String(val).trim() : null;
    if (!text) {
      await supabase.schema(COS).from('product_attributes').delete().eq('product_id', productId).eq('attribute_definition_id', defId);
      continue;
    }
    const { error } = await supabase.schema(COS).from('product_attributes').upsert(
      { product_id: productId, attribute_definition_id: defId, value_text: text },
      { onConflict: 'product_id,attribute_definition_id' },
    );
    if (error) throw error;
  }
}

async function refreshDerivedAttributes(supabase, productId) {
  const sb = supabase || getSupabaseAdmin();
  const { error } = await sb.rpc('catalogos_merge_product_attribute_facets', { p_product_id: productId });
  if (error) throw error;
}

/**
 * Upsert or delete normalized facet rows by attribute_key for the product's category.
 * @param {string} productId - catalogos.products.id
 * @param {Array<{ attribute_key: string, value_text?: string | null }>} rows
 */
async function setAttributes(productId, rows) {
  const supabase = getSupabaseAdmin();
  const existing = await fetchProductRow(supabase, productId);
  if (!existing) throw new Error('Product not found');
  const categoryId = existing.category_id;
  const defs = await loadAttributeDefinitions(supabase, categoryId);
  for (const row of rows || []) {
    const key = String(row.attribute_key || row.definition_key || '').toLowerCase();
    const defId = defs.get(key);
    if (!defId) continue;
    const text = row.value_text != null && String(row.value_text).trim() !== '' ? String(row.value_text).trim() : null;
    if (!text) {
      const { error: delErr } = await supabase
        .schema(COS)
        .from('product_attributes')
        .delete()
        .eq('product_id', productId)
        .eq('attribute_definition_id', defId);
      if (delErr) throw delErr;
      continue;
    }
    const { error } = await supabase.schema(COS).from('product_attributes').upsert(
      { product_id: productId, attribute_definition_id: defId, value_text: text },
      { onConflict: 'product_id,attribute_definition_id' },
    );
    if (error) throw error;
  }
  await refreshDerivedAttributes(supabase, productId);
}

async function syncProductImages(supabase, productId, payload) {
  const primary = (payload.image_url || payload.imageUrl || '').toString().trim();
  const extra = Array.isArray(payload.images) ? payload.images : [];
  const urls = [];
  if (primary) urls.push(primary);
  for (const x of extra) {
    const u = typeof x === 'string' ? x.trim() : x && x.url ? String(x.url).trim() : '';
    if (u && !urls.includes(u)) urls.push(u);
  }
  await supabase.schema(COS).from('product_images').delete().eq('product_id', productId);
  let sort = 0;
  for (const url of urls) {
    const { error: insErr } = await supabase.schema(COS).from('product_images').insert({
      product_id: productId,
      url,
      sort_order: sort,
    });
    if (insErr) throw insErr;
    sort += 1;
  }
}

async function fetchProductRow(supabase, idOrSku) {
  const s = String(idOrSku || '').trim();
  if (!s) return null;
  if (isUuid(s)) {
    const { data, error } = await supabase.schema(COS).from('products').select(PRODUCT_SELECT).eq('id', s).maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.schema(COS).from('products').select(PRODUCT_SELECT).eq('sku', s).maybeSingle();
  if (error) throw error;
  return data;
}

async function attributeValueMap(supabase, productId) {
  const { data, error } = await supabase
    .schema(COS)
    .from('product_attributes')
    .select('value_text, attribute_definitions!inner(attribute_key)')
    .eq('product_id', productId);
  if (error) throw error;
  const m = {};
  for (const row of data || []) {
    const key = row.attribute_definitions?.attribute_key;
    if (key && row.value_text != null) m[String(key).toLowerCase()] = row.value_text;
  }
  return m;
}

/**
 * Mutates product: sets catalog_v2_product_id when listing maps to catalog_v2.
 * @param {{ id?: unknown, catalog_v2_product_id?: unknown, sku?: unknown, name?: unknown }} product
 */
async function attachCatalogV2ProductId(product) {
  if (!product || product.id == null) return product;
  const key = normalizeCanonicalUuidInput(product.id);
  if (!key) return product;

  const cached = catalogV2IdByListingId.get(key);
  if (cached) {
    product.catalog_v2_product_id = cached;
    return product;
  }

  try {
    const v2 = await resolveCatalogV2ProductId(key);
    catalogV2IdByListingId.set(key, v2);
    catalogV2UnmappedListingLogged.delete(key);
    product.catalog_v2_product_id = v2;
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    const code = err && err.name ? String(err.name) : 'CatalogV2ResolveError';
    if (!catalogV2UnmappedListingLogged.has(key)) {
      catalogV2UnmappedListingLogged.add(key);
      console.warn('[catalogosProductService] unmapped listing (no catalog_v2 row)', {
        listing_id: key,
        sku: product.sku != null ? String(product.sku) : '',
        name: product.name != null ? String(product.name).slice(0, 120) : '',
        resolver_error_code: code,
        resolver_error_message: msg.slice(0, 500),
      });
    }
  }
  return product;
}

/**
 * @param {Array<{ id?: unknown }>|null|undefined} products
 */
async function attachCatalogV2ProductIds(products) {
  for (const p of products || []) {
    await attachCatalogV2ProductId(p);
  }
  return products;
}

function rowMatchesFilters(flat, options) {
  const { material, powder, thickness, size, color, grade, useCase } = options;
  if (material && String(material).trim()) {
    const mat = (flat.material || '').toLowerCase();
    if (!mat.includes(String(material).trim().toLowerCase())) return false;
  }
  if (color && String(color).trim()) {
    const c = (flat.color || '').toLowerCase();
    if (!c.includes(String(color).trim().toLowerCase())) return false;
  }
  if (size && String(size).trim()) {
    const sz = (flat.sizes || '').toLowerCase();
    if (!sz.includes(String(size).trim().toLowerCase())) return false;
  }
  if (powder && String(powder).trim()) {
    const want = powder.toLowerCase();
    const po = (flat.powder || '').toLowerCase();
    const nm = (flat.name || '').toLowerCase();
    if (want === 'powder-free' && !po.includes('powder') && !nm.includes('powder-free') && !nm.includes('powder free')) return false;
  }
  if (thickness && String(thickness).trim()) {
    const th = `${flat.thickness || ''} ${flat.name || ''}`.toLowerCase();
    if (!th.includes(String(thickness).trim().toLowerCase())) return false;
  }
  if (grade && String(grade).trim()) {
    const g = `${flat.grade || ''} ${flat.name || ''} ${flat.description || ''}`.toLowerCase();
    if (!g.includes(String(grade).trim().toLowerCase())) return false;
  }
  if (useCase && String(useCase).trim()) {
    const u = `${flat.use_case || ''} ${flat.name || ''} ${flat.description || ''}`.toLowerCase();
    if (!u.includes(String(useCase).trim().toLowerCase())) return false;
  }
  return true;
}

async function getProducts(options = {}) {
  const supabase = getSupabaseAdmin();
  const { search, category, brand, material, powder, thickness, size, color, grade, useCase, page = 1, limit = 100 } = options;
  let q = supabase.schema(COS).from('products').select(PRODUCT_SELECT, { count: 'exact' }).eq('is_active', true);

  if (search && String(search).trim()) {
    const t = String(search).trim();
    q = q.or(`name.ilike.%${t}%,description.ilike.%${t}%,sku.ilike.%${t}%`);
  }
  if (category) {
    const catId = await resolveCategoryIdForProductFilter(supabase, category);
    if (catId) q = q.eq('category_id', catId);
  }
  if (brand && String(brand).trim()) {
    const { data: br } = await supabase.schema(COS).from('brands').select('id').ilike('name', String(brand).trim()).limit(1).maybeSingle();
    if (br?.id) q = q.eq('brand_id', br.id);
  }

  const pageSize = Number(limit) || 100;
  const pageNum = Number(page) || 1;
  const needsClientFilter = !!(material || powder || thickness || size || color || grade || useCase);
  const from = (pageNum - 1) * pageSize;

  if (!needsClientFilter) {
    q = q.range(from, from + pageSize - 1).order('sku', { ascending: true });
    const { data, error, count } = await q;
    if (error) {
      console.error('[CatalogService] getProducts error', error);
      throw error;
    }
    const products = (data || []).map((p) => rowToProduct(mapJoinedRow(p, p.categories, p.brands, p.product_images, null)));
    await attachCatalogV2ProductIds(products);
    return { products, total: count ?? products.length };
  }

  const { data: allRows, error, count } = await q.order('sku', { ascending: true });
  if (error) {
    console.error('[CatalogService] getProducts error', error);
    throw error;
  }
  const matched = [];
  for (const p of allRows || []) {
    const flat = mapJoinedRow(p, p.categories, p.brands, p.product_images, null);
    if (!rowMatchesFilters(flat, { material, powder, thickness, size, color, grade, useCase })) continue;
    matched.push(rowToProduct(flat));
  }
  const slice = matched.slice(from, from + pageSize);
  await attachCatalogV2ProductIds(slice);
  return { products: slice, total: matched.length || count || 0 };
}

async function getProductById(id) {
  const supabase = getSupabaseAdmin();
  const p = await fetchProductRow(supabase, id);
  if (!p) return null;
  const attrMap = await attributeValueMap(supabase, p.id);
  const out = rowToProduct(mapJoinedRow(p, p.categories, p.brands, p.product_images, attrMap));
  return attachCatalogV2ProductId(out);
}

async function getProductBySkuForWrite(sku) {
  const supabase = getSupabaseAdmin();
  const s = (sku || '').toString().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const { data, error } = await supabase
    .schema(COS)
    .from('products')
    .select('id, sku, attributes, brands ( name )')
    .eq('sku', s);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  if (data.length > 1) return { ambiguous: true, rows: data };
  const r = data[0];
  const attrs = r.attributes || {};
  const cost = attrs.unit_cost != null ? Number(attrs.unit_cost) : attrs.cost != null ? Number(attrs.cost) : null;
  const price = attrs.list_price != null ? Number(attrs.list_price) : null;
  return {
    id: r.id,
    sku: r.sku,
    cost,
    price,
    bulk_price: attrs.bulk_price != null ? Number(attrs.bulk_price) : null,
    case_qty: attrs.case_qty ?? null,
    brand: r.brands?.name || attrs.merch_brand || '',
  };
}

async function getProductBySlug(slug, categorySegment) {
  const supabase = getSupabaseAdmin();
  const slugLower = (slug || '').toString().trim().toLowerCase();
  if (!slugLower) return null;
  const { data: rows, error } = await supabase.schema(COS).from('products').select(PRODUCT_SELECT).or(`slug.eq.${slugLower},slug.is.null`);
  if (error) throw error;
  let list = (rows || []).filter((r) => (r.slug || slugFromName(r.name)) === slugLower);
  if (list.length > 1 && categorySegment) {
    const seg = (categorySegment || '').toLowerCase().replace(/\s+/g, '-');
    for (const r of list) {
      const attrMap = await attributeValueMap(supabase, r.id);
      const flat = mapJoinedRow(r, r.categories, r.brands, r.product_images, attrMap);
      const mat = (flat.material || '').toLowerCase().replace(/\s+/g, '-');
      const sub = (flat.subcategory || '').toLowerCase().replace(/\s+/g, '-');
      const cat = (flat.category || '').toLowerCase().replace(/\s+/g, '-');
      if (mat === seg || sub === seg || cat === seg) {
        const out = rowToProduct(flat);
        out.slug = slugLower;
        return attachCatalogV2ProductId(out);
      }
    }
  }
  const row = list.length > 0 ? list[0] : null;
  if (!row) return null;
  const attrMap = await attributeValueMap(supabase, row.id);
  const out = rowToProduct(mapJoinedRow(row, row.categories, row.brands, row.product_images, attrMap));
  out.slug = slugLower;
  return attachCatalogV2ProductId(out);
}

async function getProductsForIndustry(useCase) {
  const supabase = getSupabaseAdmin();
  const use = (useCase || '').toLowerCase();
  let q = supabase.schema(COS).from('products').select(PRODUCT_SELECT);
  if (use === 'healthcare') {
    q = q.or('name.ilike.%healthcare%,name.ilike.%medical%,name.ilike.%exam%,name.ilike.%hospital%,description.ilike.%healthcare%,description.ilike.%medical%');
  } else if (use === 'food service' || use === 'foodservice') {
    q = q.or('name.ilike.%food service%,name.ilike.%foodservice%,name.ilike.%restaurant%,name.ilike.%catering%,description.ilike.%food service%');
  } else if (use === 'food processing') {
    q = q.or('name.ilike.%food processing%,name.ilike.%foodprocessing%,description.ilike.%food processing%');
  } else if (use === 'janitorial') {
    q = q.or('name.ilike.%janitorial%,name.ilike.%cleaning%,name.ilike.%custodial%,description.ilike.%janitorial%');
  } else if (use === 'manufacturing' || use === 'industrial') {
    q = q.or('name.ilike.%manufacturing%,name.ilike.%industrial%,name.ilike.%assembly%,description.ilike.%industrial%');
  } else if (use === 'automotive') {
    q = q.or('name.ilike.%automotive%,name.ilike.%mechanic%,description.ilike.%automotive%');
  }
  const { data, error } = await q.eq('is_active', true).limit(500);
  if (error) throw error;
  const out = [];
  for (const p of data || []) {
    const attrMap = await attributeValueMap(supabase, p.id);
    out.push(rowToProduct(mapJoinedRow(p, p.categories, p.brands, p.product_images, attrMap)));
  }
  await attachCatalogV2ProductIds(out);
  return out;
}

async function createProduct(payload) {
  const supabase = getSupabaseAdmin();
  const categoryId = await resolveCategoryId(supabase, payload);
  const brandId = await resolveBrandId(supabase, payload.brand);
  const slug = payload.slug || slugFromName(payload.name);
  const attrsJson = mergeMerchIntoAttributesJson(payload, {});
  const insert = {
    sku: (payload.sku || '').toString().trim(),
    name: payload.name || '',
    category_id: categoryId,
    brand_id: brandId,
    manufacturer_id:
      payload.manufacturer_id != null && Number.isFinite(Number(payload.manufacturer_id)) && Number(payload.manufacturer_id) > 0
        ? Number(payload.manufacturer_id)
        : null,
    description: payload.description || null,
    attributes: attrsJson,
    is_active: payload.in_stock == null || Number(payload.in_stock) !== 0,
    slug: slug || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.schema(COS).from('products').insert(insert).select('id').single();
  if (error) throw error;
  const id = data.id;
  await syncProductAttributes(supabase, id, categoryId, payload);
  await syncProductImages(supabase, id, payload);
  return getProductById(id);
}

async function updateProduct(id, payload) {
  const supabase = getSupabaseAdmin();
  const existing = await fetchProductRow(supabase, id);
  if (!existing) throw new Error('Product not found');
  const categoryId =
    payload.category !== undefined || payload.category_id !== undefined
      ? await resolveCategoryId(supabase, payload)
      : existing.category_id;
  const brandId = payload.brand !== undefined ? await resolveBrandId(supabase, payload.brand) : existing.brand_id;
  const attrsJson = mergeMerchIntoAttributesJson(payload, existing.attributes || {});
  const updates = {
    updated_at: new Date().toISOString(),
    sku: payload.sku !== undefined ? payload.sku : existing.sku,
    name: payload.name !== undefined ? payload.name : existing.name,
    description: payload.description !== undefined ? payload.description : existing.description,
    category_id: categoryId,
    brand_id: brandId,
    manufacturer_id:
      payload.manufacturer_id !== undefined
        ? payload.manufacturer_id != null && Number.isFinite(Number(payload.manufacturer_id)) && Number(payload.manufacturer_id) > 0
          ? Number(payload.manufacturer_id)
          : null
        : existing.manufacturer_id ?? null,
    attributes: attrsJson,
    is_active: payload.in_stock !== undefined ? Number(payload.in_stock) !== 0 : existing.is_active,
  };
  if (payload.slug !== undefined || payload.name !== undefined) {
    updates.slug = payload.slug != null ? payload.slug : existing.slug || slugFromName(updates.name);
  }
  const { error } = await supabase.schema(COS).from('products').update(updates).eq('id', existing.id);
  if (error) throw error;
  await syncProductAttributes(supabase, existing.id, categoryId, payload);
  await syncProductImages(supabase, existing.id, payload);
  return getProductById(existing.id);
}

async function deleteProduct(id) {
  const supabase = getSupabaseAdmin();
  const existing = await fetchProductRow(supabase, id);
  if (!existing) return;
  const { count, error: cErr } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .eq('canonical_product_id', existing.id);
  if (cErr) throw cErr;
  if ((count || 0) > 0) return;
  const { error: delImg } = await supabase.schema(COS).from('product_images').delete().eq('product_id', existing.id);
  if (delImg) throw delImg;
  const { error: delAttr } = await supabase.schema(COS).from('product_attributes').delete().eq('product_id', existing.id);
  if (delAttr) throw delAttr;
  const { error } = await supabase.schema(COS).from('products').delete().eq('id', existing.id);
  if (error) throw error;
}

async function deleteProductsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  let n = 0;
  for (const raw of ids) {
    const id = String(raw).trim();
    const before = await getProductById(id);
    if (!before) continue;
    await deleteProduct(id);
    const after = await getProductById(id);
    if (!after) n += 1;
  }
  return n;
}

async function getCategories() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .schema(COS)
    .from('products')
    .select('categories(name)')
    .eq('is_active', true);
  if (error) throw error;
  const set = new Set((data || []).map((r) => r.categories?.name).filter(Boolean));
  return [...set].sort();
}

async function getBrands() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.schema(COS).from('brands').select('name').order('name', { ascending: true });
  if (error) throw error;
  const names = (data || []).map((r) => r.name).filter(Boolean);
  return [...new Set(names)].sort((a, b) => String(a).localeCompare(String(b)));
}

async function upsertProductFromCsvRow({ sku, name, brand, cost, image_url }) {
  const supabase = getSupabaseAdmin();
  const skuClean = (sku || '').toString().trim();
  if (!skuClean) return { skipped: true };
  const { data: existing } = await supabase.schema(COS).from('products').select('id, attributes, category_id').eq('sku', skuClean).maybeSingle();
  const payload = {
    sku: skuClean,
    name: name || skuClean,
    brand: brand || '',
    cost: cost != null ? Number(cost) : 0,
    image_url: image_url || null,
    images: image_url ? [image_url] : [],
  };
  if (existing?.id) {
    const attrsJson = mergeMerchIntoAttributesJson(payload, existing.attributes || {});
    await supabase.schema(COS).from('products').update({ name: payload.name, attributes: attrsJson, updated_at: new Date().toISOString() }).eq('id', existing.id);
    await syncProductAttributes(supabase, existing.id, existing.category_id, payload);
    if (image_url) await syncProductImages(supabase, existing.id, payload);
    return { updated: true, id: existing.id };
  }
  const created = await createProduct(payload);
  return { created: true, id: created && created.id };
}

module.exports = {
  getProducts,
  getProductById,
  attachCatalogV2ProductId,
  attachCatalogV2ProductIds,
  getProductBySkuForWrite,
  getProductBySlug,
  getProductsForIndustry,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProductsByIds,
  getCategories,
  getBrands,
  rowToProduct,
  slugFromName,
  upsertProductFromCsvRow,
  setAttributes,
  refreshDerivedAttributes,
};
