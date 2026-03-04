-- Option A: products.attributes JSONB + attribute_warnings + source_confidence for Quick Add by URL filter attributes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'attributes') THEN
    ALTER TABLE products ADD COLUMN attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'attribute_warnings') THEN
    ALTER TABLE products ADD COLUMN attribute_warnings TEXT[] NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'source_confidence') THEN
    ALTER TABLE products ADD COLUMN source_confidence JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_attributes_gin ON products USING GIN (attributes);
