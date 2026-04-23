-- Post–identity migration checks (run after 20260707120000_public_users_uuid_identity).

-- public.users PK is UUID and references auth
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id';

SELECT COUNT(*) AS users_without_auth
FROM public.users u
WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id);

-- Bridge tables removed
SELECT to_regclass('gc_commerce.legacy_user_map') AS legacy_map_should_be_null;
SELECT to_regclass('gc_commerce.user_profiles') AS user_profiles_should_be_null;

-- Sample: audit log uses UUID user ids
SELECT COUNT(*) AS pricing_audit_bigint_user_id
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pricing_tier_audit_log' AND column_name = 'user_id' AND data_type = 'bigint';
