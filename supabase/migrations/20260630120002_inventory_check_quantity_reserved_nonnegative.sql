-- quantity_reserved cannot be negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_quantity_reserved_nonnegative'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT check_quantity_reserved_nonnegative
      CHECK (quantity_reserved >= 0);
  END IF;
END $$;
