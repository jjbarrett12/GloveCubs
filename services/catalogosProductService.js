/**
 * Catalog product service — reads/writes catalog_v2.catalog_products only (no legacy listing table).
 * Facet rows: catalogos.product_attributes keyed by v2 parent id; images: catalogos.product_images or v2 images via embed.
 */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { normalizeCanonicalUuidInput } = require('../lib/resolve-canonical-product-id');
const { resolveCatalogV2ProductId } = require('../lib/resolve-catalog-v2-product-id');
const { dollarsToMinor, minorToDollars } = require('../lib/gcOrderNormalize');
const { pricingDollarsFromSellableRow, MissingSellablePricingError } = require('../lib/sellable-product-pricing');

const COS = 'catalogos';
const V2 = 'catalog_v2';
const GC = 'gc_commerce';
const V2_DEFAULT_PRODUCT_TYPE_ID = 'b1111111-1111-4111-8111-111111111111';

const catalogV2UnmappedLogged = new Set();

const V2_PRODUCT_SELECT = `
  id, internal_sku, name, slug, description, metadata, status, brand_id, manufacturer_id, product_type_id, created_at, updated_at,
  catalog_product_images ( url, sort_order )
`;

/** PostgREST does not expose catalog_products→brands embed across schemas; resolve names from catalogos.brands. */
async function loadBrandNamesByIds(supabase, brandIds) {
  const ids = [
    ...new Set(
      (brandIds || [])
        .filter((id) => id != null && String(id).trim() !== '')
        .map((id) => String(id)),
    ),
  ];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.schema(COS).from('brands').select('id, name').in('id', ids);
  if (error) throw error;
  const m = new Map();
  for (const b of data || []) {
    m.set(String(b.id), b.name != null ? String(b.name) : '');
  }
  return m;
}

/** mapJoinedRow expects `{ name }` or null (falls back to attrs.merch_brand). */
function brandFromMap(p, brandById) {
  if (!p || p.brand_id == null || !brandById) return null;
  const name = brandById.get(String(p.brand_id));
  return name != null && name !== '' ? { name } : null;
}

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || ''));
}

function slugFromName(name) {
  const raw = (name || '').toString().trim();
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '';
}

function slugFromCategoryLabel(label) {
  return slugFromName(label);
}

/**
 * Resolve storefront category filter to catalogos.categories.id (facet / attribute defs still keyed by this id).
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

/** Normalize v2 row for mapJoinedRow / rowToProduct (listing shape). */
function normalizeV2ProductRow(p) {
  if (!p) return null;
  const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
  const facet = meta.facet_attributes && typeof meta.facet_attributes === 'object' ? meta.facet_attributes : {};
  const attrs = { ...facet, ...meta };
  delete attrs.facet_attributes;
  const imgs = p.catalog_product_images || [];
  return {
    ...p,
    sku: p.internal_sku,
    is_active: p.status === 'active',
    attributes: attrs,
    category_id: meta.category_id != null ? String(meta.category_id) : null,
    categories: null,
    product_images: Array.isArray(imgs) ? imgs : [],
  };
}

const PRICING_ATTR_KEYS = ['list_price', 'bulk_price', 'unit_cost', 'cost', 'retail_price'];

function scrubPricingKeysFromAttributes(attrs) {
  const a = attrs && typeof attrs === 'object' ? { ...attrs } : {};
  for (const k of PRICING_ATTR_KEYS) delete a[k];
  return a;
}

/**
 * @param {object} row - mapJoinedRow / flat v2 listing shape
 * @param {object} sellableRow - gc_commerce.sellable_products row for this catalog_product_id
 */
function rowToProduct(row, sellableRow) {
  if (!row) return null;
  const r = row;
  const attrs = scrubPricingKeysFromAttributes(r.attributes && typeof r.attributes === 'object' ? r.attributes : {});
  const idStr = r.id != null ? String(r.id) : '';
  const { price, list_price, bulk_price, cost } = pricingDollarsFromSellableRow({
    ...sellableRow,
    catalog_product_id: idStr,
  });
  return {
    id: idStr,
    sku: r.sku || r.internal_sku || '',
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
    list_price,
    price,
    bulk_price,
    cost,
    image_url: r.image_url || '',
    images: Array.isArray(r.images) ? r.images : [],
    in_stock: r.in_stock != null ? r.in_stock : r.is_active === false ? 0 : 1,
    listing_id: idStr || undefined,
    canonical_product_id: idStr || undefined,
    catalog_v2_product_id: idStr || undefined,
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
  const imgRows = (images || p.product_images || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
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
  for (const k of PRICING_ATTR_KEYS) delete base[k];
  const fromPayload = payload.attributes && typeof payload.attributes === 'object' ? { ...payload.attributes } : {};
  for (const k of PRICING_ATTR_KEYS) delete fromPayload[k];
  const out = { ...base, ...fromPayload };
  for (const k of PRICING_ATTR_KEYS) delete out[k];
  if (payload.pack_qty !== undefined) out.pack_qty = payload.pack_qty;
  if (payload.case_qty !== undefined) out.case_qty = payload.case_qty;
  if (payload.featured !== undefined) out.featured = payload.featured;
  if (payload.attribute_warnings) out.attribute_warnings = payload.attribute_warnings;
  if (payload.source_confidence) out.source_confidence = payload.source_confidence;
  if (payload.brand) out.merch_brand = payload.brand;
  return out;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} catalogIds - catalog_v2.catalog_products.id
 * @returns {Promise<Map<string, object>>}
 */
async function fetchActiveSellableMap(supabase, catalogIds) {
  const ids = [...new Set((catalogIds || []).filter(Boolean).map((id) => String(id)))];
  const m = new Map();
  if (ids.length === 0) return m;
  const { data, error } = await supabase
    .schema(GC)
    .from('sellable_products')
    .select('catalog_product_id, list_price_minor, bulk_price_minor, unit_cost_minor, sku, display_name, is_active')
    .in('catalog_product_id', ids)
    .eq('is_active', true);
  if (error) throw error;
  for (const r of data || []) {
    const cid = r.catalog_product_id != null ? String(r.catalog_product_id) : '';
    if (cid && !m.has(cid)) m.set(cid, r);
  }
  return m;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function upsertSellablePricingForCatalogProduct(supabase, params) {
  const {
    catalogProductId,
    sku,
    displayName,
    price,
    bulk_price,
    cost,
    isActive = true,
  } = params;
  const pid = String(catalogProductId || '').trim();
  const skuTrim = String(sku || '').trim();
  if (!pid || !skuTrim) throw new Error('upsertSellablePricingForCatalogProduct requires catalogProductId and sku');
  if (price == null || price === '' || !Number.isFinite(Number(price))) {
    throw new Error('upsertSellablePricingForCatalogProduct requires finite price (list, USD)');
  }
  const listMinor = dollarsToMinor(Number(price));
  let bulkMinor = null;
  if (bulk_price != null && bulk_price !== '' && Number.isFinite(Number(bulk_price))) {
    bulkMinor = dollarsToMinor(Number(bulk_price));
  }
  let costMinor = null;
  if (cost != null && cost !== '' && Number.isFinite(Number(cost))) {
    costMinor = dollarsToMinor(Number(cost));
  }
  const now = new Date().toISOString();
  const { error: sellErr } = await supabase.schema(GC).from('sellable_products').upsert(
    {
      sku: skuTrim,
      display_name: String(displayName || skuTrim || 'Product').trim(),
      catalog_product_id: pid,
      currency_code: 'USD',
      list_price_minor: listMinor,
      bulk_price_minor: bulkMinor,
      unit_cost_minor: costMinor,
      is_active: isActive !== false,
      updated_at: now,
    },
    { onConflict: 'sku' },
  );
  if (sellErr) throw sellErr;
}

function rowToProductWithSellableMap(flat, sellableMap) {
  const idStr = flat.id != null ? String(flat.id) : '';
  const sp = sellableMap.get(idStr);
  return rowToProduct(flat, sp);
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

/** Sync catalogos.product_images; product_id is catalog_v2 parent id. */
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
  let data;
  let error;
  if (isUuid(s)) {
    ({ data, error } = await supabase.schema(V2).from('catalog_products').select(V2_PRODUCT_SELECT).eq('id', s).maybeSingle());
  } else {
    ({ data, error } = await supabase.schema(V2).from('catalog_products').select(V2_PRODUCT_SELECT).eq('internal_sku', s).maybeSingle());
  }
  if (error) throw error;
  return normalizeV2ProductRow(data);
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

async function attachCatalogV2ProductId(product) {
  if (!product || product.id == null) return product;
  if (product.catalog_v2_product_id) {
    product.canonical_product_id = product.catalog_v2_product_id;
    return product;
  }
  const key = normalizeCanonicalUuidInput(product.id);
  if (!key) return product;
  try {
    const v2Id = await resolveCatalogV2ProductId(key);
    product.catalog_v2_product_id = v2Id;
    product.canonical_product_id = v2Id;
    product.listing_id = key;
    catalogV2UnmappedLogged.delete(key);
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    const code = err && err.name ? String(err.name) : 'CatalogV2ResolveError';
    if (!catalogV2UnmappedLogged.has(key)) {
      catalogV2UnmappedLogged.add(key);
      console.warn('[catalogosProductService] catalog_v2 lookup failed', {
        product_id: key,
        sku: product.sku != null ? String(product.sku) : '',
        name: product.name != null ? String(product.name).slice(0, 120) : '',
        resolver_error_code: code,
        resolver_error_message: msg.slice(0, 500),
      });
    }
  }
  return product;
}

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
  let q = supabase.schema(V2).from('catalog_products').select(V2_PRODUCT_SELECT, { count: 'exact' }).eq('status', 'active');

  if (search && String(search).trim()) {
    const t = String(search).trim();
    q = q.or(`name.ilike.%${t}%,description.ilike.%${t}%,internal_sku.ilike.%${t}%`);
  }
  if (category) {
    const catId = await resolveCategoryIdForProductFilter(supabase, category);
    if (catId) q = q.contains('metadata', { category_id: catId });
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
    q = q.range(from, from + pageSize - 1).order('internal_sku', { ascending: true });
    const { data, error, count } = await q;
    if (error) {
      console.error('[CatalogService] getProducts error', error);
      throw error;
    }
    const normalized = (data || []).map((p) => normalizeV2ProductRow(p));
    const brandById = await loadBrandNamesByIds(
      supabase,
      normalized.map((n) => n.brand_id),
    );
    const sellableMap = await fetchActiveSellableMap(
      supabase,
      normalized.map((n) => n.id),
    );
    const products = normalized.map((n) =>
      rowToProductWithSellableMap(mapJoinedRow(n, null, brandFromMap(n, brandById), n.product_images, null), sellableMap),
    );
    await attachCatalogV2ProductIds(products);
    return { products, total: count ?? products.length };
  }

  const { data: allRows, error, count } = await q.order('internal_sku', { ascending: true });
  if (error) {
    console.error('[CatalogService] getProducts error', error);
    throw error;
  }
  const normalizedAll = (allRows || []).map((p) => normalizeV2ProductRow(p));
  const brandById = await loadBrandNamesByIds(
    supabase,
    normalizedAll.map((n) => n.brand_id),
  );
  const sellableMapAll = await fetchActiveSellableMap(
    supabase,
    normalizedAll.map((n) => n.id),
  );
  const matched = [];
  for (const n of normalizedAll) {
    const flat = mapJoinedRow(n, null, brandFromMap(n, brandById), n.product_images, null);
    if (!rowMatchesFilters(flat, { material, powder, thickness, size, color, grade, useCase })) continue;
    matched.push(rowToProductWithSellableMap(flat, sellableMapAll));
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
  const brandById = await loadBrandNamesByIds(supabase, [p.brand_id]);
  const sellableMap = await fetchActiveSellableMap(supabase, [p.id]);
  const out = rowToProductWithSellableMap(mapJoinedRow(p, null, brandFromMap(p, brandById), p.product_images, attrMap), sellableMap);
  return attachCatalogV2ProductId(out);
}

async function getProductBySkuForWrite(sku) {
  const supabase = getSupabaseAdmin();
  const s = (sku || '').toString().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const { data, error } = await supabase
    .schema(V2)
    .from('catalog_products')
    .select('id, internal_sku, metadata, brand_id')
    .eq('internal_sku', s);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  if (data.length > 1) return { ambiguous: true, rows: data };
  const r = data[0];
  const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
  const facet = meta.facet_attributes && typeof meta.facet_attributes === 'object' ? meta.facet_attributes : {};
  const attrs = scrubPricingKeysFromAttributes({ ...meta, ...facet });
  const sellableMap = await fetchActiveSellableMap(supabase, [r.id]);
  const sp = sellableMap.get(String(r.id));
  const { price, bulk_price, cost } = pricingDollarsFromSellableRow({ ...sp, catalog_product_id: String(r.id) });
  const brandById = await loadBrandNamesByIds(supabase, [r.brand_id]);
  const brandName = brandFromMap({ brand_id: r.brand_id }, brandById)?.name || attrs.merch_brand || '';
  return {
    id: r.id,
    sku: r.internal_sku,
    cost,
    price,
    bulk_price,
    case_qty: attrs.case_qty ?? null,
    brand: brandName,
  };
}

async function getProductBySlug(slug, categorySegment) {
  const supabase = getSupabaseAdmin();
  const slugLower = (slug || '').toString().trim().toLowerCase();
  if (!slugLower) return null;
  let { data: rows, error } = await supabase.schema(V2).from('catalog_products').select(V2_PRODUCT_SELECT).eq('slug', slugLower);
  if (error) throw error;
  let list = (rows || []).map(normalizeV2ProductRow);
  if (list.length === 0) {
    const { data: candidates, error: cErr } = await supabase
      .schema(V2)
      .from('catalog_products')
      .select(V2_PRODUCT_SELECT)
      .eq('status', 'active')
      .limit(800);
    if (cErr) throw cErr;
    list = (candidates || [])
      .map(normalizeV2ProductRow)
      .filter((r) => String(r.slug || slugFromName(r.name) || '')
        .toLowerCase() === slugLower);
  }
  const brandById = await loadBrandNamesByIds(
    supabase,
    list.map((r) => r.brand_id),
  );
  const sellableSlugMap = await fetchActiveSellableMap(
    supabase,
    list.map((r) => r.id),
  );
  if (list.length > 1 && categorySegment) {
    const seg = (categorySegment || '').toLowerCase().replace(/\s+/g, '-');
    for (const r of list) {
      const attrMap = await attributeValueMap(supabase, r.id);
      const flat = mapJoinedRow(r, null, brandFromMap(r, brandById), r.product_images, attrMap);
      const mat = (flat.material || '').toLowerCase().replace(/\s+/g, '-');
      const sub = (flat.subcategory || '').toLowerCase().replace(/\s+/g, '-');
      const cat = (flat.category || '').toLowerCase().replace(/\s+/g, '-');
      if (mat === seg || sub === seg || cat === seg) {
        const out = rowToProductWithSellableMap(flat, sellableSlugMap);
        out.slug = slugLower;
        return attachCatalogV2ProductId(out);
      }
    }
  }
  const row = list.length > 0 ? list[0] : null;
  if (!row) return null;
  const attrMap = await attributeValueMap(supabase, row.id);
  const out = rowToProductWithSellableMap(mapJoinedRow(row, null, brandFromMap(row, brandById), row.product_images, attrMap), sellableSlugMap);
  out.slug = slugLower;
  return attachCatalogV2ProductId(out);
}

async function getProductsForIndustry(useCase) {
  const supabase = getSupabaseAdmin();
  const use = (useCase || '').toLowerCase();
  let q = supabase.schema(V2).from('catalog_products').select(V2_PRODUCT_SELECT);
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
  const { data, error } = await q.eq('status', 'active').limit(500);
  if (error) throw error;
  const normalized = (data || []).map((raw) => normalizeV2ProductRow(raw));
  const brandById = await loadBrandNamesByIds(
    supabase,
    normalized.map((p) => p.brand_id),
  );
  const sellableIndustryMap = await fetchActiveSellableMap(
    supabase,
    normalized.map((p) => p.id),
  );
  const out = [];
  for (const p of normalized) {
    const attrMap = await attributeValueMap(supabase, p.id);
    out.push(rowToProductWithSellableMap(mapJoinedRow(p, null, brandFromMap(p, brandById), p.product_images, attrMap), sellableIndustryMap));
  }
  await attachCatalogV2ProductIds(out);
  return out;
}

async function createProduct(payload) {
  const supabase = getSupabaseAdmin();
  const categoryId = await resolveCategoryId(supabase, payload);
  const brandId = await resolveBrandId(supabase, payload.brand);
  let slug = payload.slug || slugFromName(payload.name);
  const sku = (payload.sku || '').toString().trim();
  if (!sku) throw new Error('sku required');
  if (payload.price == null || payload.price === '' || !Number.isFinite(Number(payload.price))) {
    throw new Error('createProduct requires finite price (USD list) for gc_commerce.sellable_products');
  }
  const { data: slugClash } = await supabase.schema(V2).from('catalog_products').select('id').eq('slug', slug || 'x').maybeSingle();
  if (slugClash?.id) slug = `${slug || 'p'}-${Date.now().toString(36)}`;
  const attrsJson = mergeMerchIntoAttributesJson(payload, {});
  const meta = { category_id: categoryId, facet_attributes: attrsJson };
  const status = payload.in_stock == null || Number(payload.in_stock) !== 0 ? 'active' : 'draft';
  const { data, error } = await supabase
    .schema(V2)
    .from('catalog_products')
    .insert({
      product_type_id: V2_DEFAULT_PRODUCT_TYPE_ID,
      slug: slug || slugFromName(payload.name || sku) || `p-${Date.now().toString(36)}`,
      internal_sku: sku,
      name: payload.name || '',
      description: payload.description || null,
      brand_id: brandId,
      manufacturer_id:
        payload.manufacturer_id != null && Number.isFinite(Number(payload.manufacturer_id)) && Number(payload.manufacturer_id) > 0
          ? Number(payload.manufacturer_id)
          : null,
      status,
      metadata: meta,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;
  const id = data.id;
  const { error: vErr } = await supabase.schema(V2).from('catalog_variants').insert({
    catalog_product_id: id,
    variant_sku: sku,
    sort_order: 0,
    is_active: status === 'active',
    metadata: {},
  });
  if (vErr) throw vErr;
  await syncProductAttributes(supabase, id, categoryId, payload);
  await syncProductImages(supabase, id, payload);
  await upsertSellablePricingForCatalogProduct(supabase, {
    catalogProductId: id,
    sku,
    displayName: payload.name || sku,
    price: Number(payload.price),
    bulk_price: payload.bulk_price,
    cost: payload.cost,
    isActive: status === 'active',
  });
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
  const prevMeta = existing.metadata && typeof existing.metadata === 'object' ? { ...existing.metadata } : {};
  const prevFacet = prevMeta.facet_attributes && typeof prevMeta.facet_attributes === 'object' ? prevMeta.facet_attributes : {};
  const attrsJson = mergeMerchIntoAttributesJson(payload, prevFacet);
  const meta = { ...prevMeta, category_id: categoryId, facet_attributes: attrsJson };
  const status =
    payload.in_stock !== undefined ? (Number(payload.in_stock) !== 0 ? 'active' : 'draft') : existing.is_active ? 'active' : 'draft';
  let slug = existing.slug;
  if (payload.slug !== undefined || payload.name !== undefined) {
    slug = payload.slug != null ? payload.slug : existing.slug || slugFromName(payload.name !== undefined ? payload.name : existing.name);
  }
  const updates = {
    updated_at: new Date().toISOString(),
    internal_sku: payload.sku !== undefined ? payload.sku : existing.internal_sku || existing.sku,
    name: payload.name !== undefined ? payload.name : existing.name,
    description: payload.description !== undefined ? payload.description : existing.description,
    brand_id: brandId,
    manufacturer_id:
      payload.manufacturer_id !== undefined
        ? payload.manufacturer_id != null && Number.isFinite(Number(payload.manufacturer_id)) && Number(payload.manufacturer_id) > 0
          ? Number(payload.manufacturer_id)
          : null
        : existing.manufacturer_id ?? null,
    metadata: meta,
    status,
    slug: slug || undefined,
  };
  const { error } = await supabase.schema(V2).from('catalog_products').update(updates).eq('id', existing.id);
  if (error) throw error;
  await syncProductAttributes(supabase, existing.id, categoryId, payload);
  await syncProductImages(supabase, existing.id, payload);

  const sellableMapUp = await fetchActiveSellableMap(supabase, [existing.id]);
  const prevSp = sellableMapUp.get(String(existing.id));
  let listPrice = payload.price !== undefined ? payload.price : null;
  if (listPrice == null || listPrice === '' || !Number.isFinite(Number(listPrice))) {
    if (!prevSp || prevSp.list_price_minor == null) {
      throw new MissingSellablePricingError(
        existing.id,
        'updateProduct requires finite price when no sellable list_price_minor exists',
      );
    }
    listPrice = minorToDollars(prevSp.list_price_minor);
  }
  let bulkVal;
  if (payload.bulk_price !== undefined) {
    bulkVal =
      payload.bulk_price == null || payload.bulk_price === '' || !Number.isFinite(Number(payload.bulk_price))
        ? null
        : Number(payload.bulk_price);
  } else if (prevSp && prevSp.bulk_price_minor != null) {
    bulkVal = minorToDollars(prevSp.bulk_price_minor);
  } else {
    bulkVal = null;
  }
  let costVal;
  if (payload.cost !== undefined) {
    costVal =
      payload.cost == null || payload.cost === '' || !Number.isFinite(Number(payload.cost)) ? null : Number(payload.cost);
  } else if (prevSp && prevSp.unit_cost_minor != null) {
    costVal = minorToDollars(prevSp.unit_cost_minor);
  } else {
    costVal = null;
  }
  await upsertSellablePricingForCatalogProduct(supabase, {
    catalogProductId: existing.id,
    sku: updates.internal_sku,
    displayName: updates.name,
    price: Number(listPrice),
    bulk_price: bulkVal,
    cost: costVal,
    isActive: status === 'active',
  });
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
  const { error } = await supabase.schema(V2).from('catalog_products').delete().eq('id', existing.id);
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
  const { data, error } = await supabase.schema(COS).from('categories').select('name').order('name', { ascending: true });
  if (error) throw error;
  const names = (data || []).map((r) => r.name).filter(Boolean);
  return [...new Set(names)].sort((a, b) => String(a).localeCompare(String(b)));
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
  const { data: existing } = await supabase
    .schema(V2)
    .from('catalog_products')
    .select('id, metadata')
    .eq('internal_sku', skuClean)
    .maybeSingle();
  const payload = {
    sku: skuClean,
    name: name || skuClean,
    brand: brand || '',
    cost: cost != null ? Number(cost) : 0,
    image_url: image_url || null,
    images: image_url ? [image_url] : [],
  };
  if (existing?.id) {
    const prevMeta = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
    const prevFacet = prevMeta.facet_attributes && typeof prevMeta.facet_attributes === 'object' ? prevMeta.facet_attributes : {};
    const attrsJson = mergeMerchIntoAttributesJson(payload, prevFacet);
    const meta = { ...prevMeta, facet_attributes: attrsJson };
    await supabase
      .schema(V2)
      .from('catalog_products')
      .update({ name: payload.name, metadata: meta, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    const catId = prevMeta.category_id || (await resolveDefaultCategoryId(supabase));
    await syncProductAttributes(supabase, existing.id, catId, payload);
    if (image_url) await syncProductImages(supabase, existing.id, payload);
    const sellableCsvMap = await fetchActiveSellableMap(supabase, [existing.id]);
    const sp = sellableCsvMap.get(String(existing.id));
    if (!sp || sp.list_price_minor == null) {
      throw new MissingSellablePricingError(existing.id);
    }
    const costNum = cost != null ? Number(cost) : NaN;
    const costMinor =
      Number.isFinite(costNum) && costNum >= 0 ? dollarsToMinor(costNum) : sp.unit_cost_minor != null ? sp.unit_cost_minor : null;
    const { data: v2sku, error: v2e } = await supabase
      .schema(V2)
      .from('catalog_products')
      .select('internal_sku, name')
      .eq('id', existing.id)
      .maybeSingle();
    if (v2e) throw v2e;
    const { error: suErr } = await supabase.schema(GC).from('sellable_products').upsert(
      {
        sku: String(v2sku?.internal_sku || skuClean).trim(),
        display_name: String(v2sku?.name || payload.name || skuClean).trim(),
        catalog_product_id: String(existing.id),
        currency_code: 'USD',
        list_price_minor: sp.list_price_minor,
        bulk_price_minor: sp.bulk_price_minor,
        unit_cost_minor: costMinor,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'sku' },
    );
    if (suErr) throw suErr;
    return { updated: true, id: existing.id };
  }
  throw new Error(
    `CSV import cannot create sku=${skuClean} without list price; create the product with a price first or add a price column to the CSV`,
  );
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
  MissingSellablePricingError,
  slugFromName,
  upsertProductFromCsvRow,
  setAttributes,
  refreshDerivedAttributes,
};
