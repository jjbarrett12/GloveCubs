-- Fast count of approved/merged staging rows linked to a master that are not yet in publish_events.

CREATE OR REPLACE FUNCTION catalogos.supplier_batch_unpublished_ready_count(p_batch_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::bigint
  FROM catalogos.supplier_products_normalized n
  WHERE n.batch_id = p_batch_id
  AND n.status IN ('approved', 'merged')
  AND n.master_product_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM catalogos.publish_events e WHERE e.normalized_id = n.id
  );
$$;

COMMENT ON FUNCTION catalogos.supplier_batch_unpublished_ready_count(uuid) IS
  'Rows in a batch ready to publish (approved/merged, master linked, no publish_events yet).';

GRANT EXECUTE ON FUNCTION catalogos.supplier_batch_unpublished_ready_count(uuid) TO authenticated, service_role;
