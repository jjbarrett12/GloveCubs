-- Add images array to products for multiple product images (gallery)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'images') THEN
    ALTER TABLE products ADD COLUMN images JSONB DEFAULT '[]';
  END IF;
END $$;
