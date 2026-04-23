-- =============================================================================
-- GLOVECUBS Load Test Seed Data
-- 
-- Run this script to create required test users and data for load testing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Test Users
-- -----------------------------------------------------------------------------

-- Password hash for 'LoadTest123!' (bcrypt)
-- Generate with: node -e "console.log(require('bcryptjs').hashSync('LoadTest123!', 10))"
-- Example hash (regenerate for security): $2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

-- Buyer test user
INSERT INTO public.users (
  company_name,
  email,
  password_hash,
  contact_name,
  phone,
  is_approved,
  discount_tier
)
VALUES (
  'LoadTest Company',
  'loadtest@glovecubs.com',
  '$2a$10$placeholder_hash_replace_me',  -- Replace with actual hash
  'Load Tester',
  '555-0100',
  1,
  'standard'
)
ON CONFLICT (email) DO UPDATE SET
  is_approved = 1,
  company_name = EXCLUDED.company_name;

-- Admin test user
INSERT INTO public.users (
  company_name,
  email,
  password_hash,
  contact_name,
  phone,
  is_approved,
  discount_tier
)
VALUES (
  'GloveCubs Admin Test',
  'admin@glovecubs.com',
  '$2a$10$placeholder_hash_replace_me',  -- Replace with actual hash
  'Admin Tester',
  '555-0101',
  1,
  'admin'
)
ON CONFLICT (email) DO UPDATE SET
  is_approved = 1,
  discount_tier = 'admin';

-- Add to admin_users table
INSERT INTO public.admin_users (email, is_active)
VALUES ('admin@glovecubs.com', true)
ON CONFLICT (email) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Verify Products Exist
-- -----------------------------------------------------------------------------

-- Check that we have products for testing
DO $$
DECLARE
  product_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO product_count FROM public.products;
  IF product_count < 5 THEN
    RAISE NOTICE 'Warning: Only % products found. Load tests expect at least 5.', product_count;
  ELSE
    RAISE NOTICE 'Found % products. Ready for load testing.', product_count;
  END IF;
END $$;

-- Get product IDs for configuration
SELECT id, sku, name 
FROM public.products 
ORDER BY id 
LIMIT 10;

-- -----------------------------------------------------------------------------
-- 3. Create Test Company (for company-scoped tests)
-- -----------------------------------------------------------------------------

INSERT INTO public.companies (name, status)
VALUES ('LoadTest Company Inc', 'active')
ON CONFLICT DO NOTHING;

-- Link test user to company
DO $$
DECLARE
  v_user_id BIGINT;
  v_company_id BIGINT;
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE email = 'loadtest@glovecubs.com';
  SELECT id INTO v_company_id FROM public.companies WHERE name = 'LoadTest Company Inc';
  
  IF v_user_id IS NOT NULL AND v_company_id IS NOT NULL THEN
    INSERT INTO public.company_users (company_id, user_id, role)
    VALUES (v_company_id, v_user_id, 'admin')
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Linked user % to company %', v_user_id, v_company_id;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Supplier Test User (if supplier portal testing needed)
-- -----------------------------------------------------------------------------

-- Check if suppliers table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'suppliers') THEN
    INSERT INTO suppliers (name, email, is_active)
    VALUES ('LoadTest Supplier', 'supplier@glovecubs.com', true)
    ON CONFLICT (email) DO UPDATE SET is_active = true;
    RAISE NOTICE 'Supplier test user created';
  ELSE
    RAISE NOTICE 'Suppliers table not found - skipping supplier test user';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Sample Favorites (for favorites testing)
-- -----------------------------------------------------------------------------

-- Create some favorites for the test user
DO $$
DECLARE
  v_user_id BIGINT;
  v_product_id BIGINT;
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE email = 'loadtest@glovecubs.com';
  SELECT id INTO v_product_id FROM public.products LIMIT 1;
  
  IF v_user_id IS NOT NULL AND v_product_id IS NOT NULL THEN
    INSERT INTO public.product_favorites (user_id, product_id)
    VALUES (v_user_id, v_product_id)
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Created sample favorite for user %', v_user_id;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6. Cleanup Old Load Test Data (run periodically)
-- -----------------------------------------------------------------------------

-- Optionally clean up old load test RFQs (uncomment to run)
-- DELETE FROM public.rfqs 
-- WHERE payload->>'company_name' LIKE 'LoadTest%'
--   AND created_at < NOW() - INTERVAL '7 days';

-- Clean up old load test quotes (uncomment to run)
-- DELETE FROM catalogos.quote_requests
-- WHERE company_name LIKE 'LoadTest%'
--   AND created_at < NOW() - INTERVAL '7 days';

-- -----------------------------------------------------------------------------
-- 7. Summary
-- -----------------------------------------------------------------------------

SELECT 'Setup Complete' AS status;

-- Show test user IDs
SELECT 'Test Users:' AS info;
SELECT id, email, company_name, discount_tier, is_approved
FROM public.users 
WHERE email IN ('loadtest@glovecubs.com', 'admin@glovecubs.com')
ORDER BY email;

-- Show product IDs for config
SELECT 'Product IDs for TEST_PRODUCT_IDS:' AS info;
SELECT string_agg(id::text, ',') AS product_ids
FROM (SELECT id FROM public.products ORDER BY id LIMIT 5) t;
