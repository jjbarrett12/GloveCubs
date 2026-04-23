-- quantity_on_hand cannot be negative (physical stock)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_quantity_on_hand_nonnegative'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT check_quantity_on_hand_nonnegative
      CHECK (quantity_on_hand >= 0);
  END IF;
END $$;
