-- Size is canonical on catalog_v2.catalog_variants.size_code only.
-- Remove legacy facet rows keyed as attribute_definitions.attribute_key = 'size'.

DELETE FROM catalogos.product_attributes pa
USING catalogos.attribute_definitions ad
WHERE pa.attribute_definition_id = ad.id
  AND ad.attribute_key = 'size';
