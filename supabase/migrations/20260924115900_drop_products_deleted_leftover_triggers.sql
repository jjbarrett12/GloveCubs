-- =============================================================================
-- Additive blank-project fix: drop leftover non-internal triggers on
-- catalogos.products_deleted_do_not_use BEFORE 20260924120000 pre-DROP checks.
--
-- Does not alter other schemas/tables. Safe no-op when the dead table is gone
-- (existing envs / staging after successful drop).
-- =============================================================================

DO $body$
DECLARE
  dead regclass := to_regclass('catalogos.products_deleted_do_not_use');
  r RECORD;
BEGIN
  IF dead IS NULL THEN
    RAISE NOTICE '20260924115900: skip — catalogos.products_deleted_do_not_use not found';
    RETURN;
  END IF;

  -- Known leftover from blank history (renamed catalogos.products trigger).
  EXECUTE 'DROP TRIGGER IF EXISTS tr_products_updated_at ON catalogos.products_deleted_do_not_use';
  EXECUTE 'DROP TRIGGER IF EXISTS trg_catalogos_products_search_tsv ON catalogos.products_deleted_do_not_use';
  EXECUTE 'DROP TRIGGER IF EXISTS trg_catalogos_products_live_product_id_deprecated ON catalogos.products_deleted_do_not_use';

  FOR r IN
    SELECT t.tgname
    FROM pg_trigger t
    WHERE t.tgrelid = dead::oid
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON catalogos.products_deleted_do_not_use',
      r.tgname
    );
  END LOOP;
END;
$body$;
