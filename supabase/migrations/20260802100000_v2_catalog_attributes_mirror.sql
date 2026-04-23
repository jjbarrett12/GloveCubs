-- V2: merge normalized facet rows into catalogos.products.attributes (JSON mirror).
-- Stale facet keys for this category are stripped first, then current product_attributes rows are merged in.
-- Merchandising keys (list_price, unit_cost, …) live only in JSON unless also defined as attribute_definitions.

CREATE OR REPLACE FUNCTION catalogos.merge_product_attribute_facets(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos
AS $$
DECLARE
  facet jsonb;
  cat uuid;
  base jsonb;
  fk text;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.category_id, coalesce(p.attributes, '{}'::jsonb)
  INTO cat, base
  FROM catalogos.products p
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT coalesce(
    jsonb_object_agg(d.attribute_key, to_jsonb(coalesce(pa.value_text, pa.value_number::text, pa.value_boolean::text))),
    '{}'::jsonb
  )
  INTO facet
  FROM catalogos.product_attributes pa
  INNER JOIN catalogos.attribute_definitions d ON d.id = pa.attribute_definition_id
  WHERE pa.product_id = p_product_id;

  IF cat IS NOT NULL THEN
    FOR fk IN
      SELECT d.attribute_key
      FROM catalogos.attribute_definitions d
      WHERE d.category_id = cat
        AND d.attribute_key IS NOT NULL
        AND btrim(d.attribute_key) <> ''
    LOOP
      base := base - fk;
    END LOOP;
  END IF;

  UPDATE catalogos.products p
  SET
    attributes = base || coalesce(facet, '{}'::jsonb),
    updated_at = now()
  WHERE p.id = p_product_id;
END;
$$;

COMMENT ON FUNCTION catalogos.merge_product_attribute_facets(uuid) IS
  'Merges product_attributes (via attribute_definitions.attribute_key) into products.attributes; call after attribute row changes.';

CREATE OR REPLACE FUNCTION catalogos.trg_merge_product_attribute_facets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalogos
AS $$
DECLARE
  pid uuid;
BEGIN
  pid := coalesce(NEW.product_id, OLD.product_id);
  PERFORM catalogos.merge_product_attribute_facets(pid);
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_product_attributes_merge_facets ON catalogos.product_attributes;
CREATE TRIGGER trg_product_attributes_merge_facets
  AFTER INSERT OR UPDATE OR DELETE ON catalogos.product_attributes
  FOR EACH ROW
  EXECUTE PROCEDURE catalogos.trg_merge_product_attribute_facets();

-- PostgREST / service role entrypoint
CREATE OR REPLACE FUNCTION public.catalogos_merge_product_attribute_facets(p_product_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = catalogos, public
AS $$
  SELECT catalogos.merge_product_attribute_facets(p_product_id);
$$;

GRANT EXECUTE ON FUNCTION catalogos.merge_product_attribute_facets(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.catalogos_merge_product_attribute_facets(uuid) TO postgres, service_role;
