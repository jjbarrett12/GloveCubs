-- Add powder and grade to products for URL import and filtering
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'powder') THEN
    ALTER TABLE products ADD COLUMN powder TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'grade') THEN
    ALTER TABLE products ADD COLUMN grade TEXT;
  END IF;
END $$;
