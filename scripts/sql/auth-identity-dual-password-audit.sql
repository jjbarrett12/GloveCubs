-- Phase 1C: dual-auth / identity audit (read-only).
-- Does not link or invent identities. No password hashes in output.
-- Usage: psql "$DATABASE_URL" -f scripts/sql/auth-identity-dual-password-audit.sql

\echo '=== 1. public.users without matching auth.users ==='
SELECT count(*) AS public_without_auth,
       (SELECT array_agg(id::text) FROM (
          SELECT u.id FROM public.users u
          WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
          LIMIT 5
        ) s) AS sample_ids
FROM public.users u
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);

\echo '=== 2. auth.users (non-deleted) without public.users profile ==='
SELECT count(*) AS auth_without_public,
       (SELECT array_agg(id::text) FROM (
          SELECT a.id FROM auth.users a
          WHERE a.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id)
          LIMIT 5
        ) s) AS sample_ids
FROM auth.users a
WHERE a.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id);

\echo '=== 3. Duplicate normalized emails in public.users ==='
SELECT lower(trim(email)) AS email_norm, count(*) AS n,
       array_agg(id::text) AS ids
FROM public.users
WHERE email IS NOT NULL AND length(trim(email)) > 0
GROUP BY 1
HAVING count(*) > 1
LIMIT 50;

\echo '=== 4. Supabase-backed users still holding bcrypt-looking password_hash ==='
SELECT count(*) AS bcrypt_hashes_on_auth_backed_users
FROM public.users u
WHERE EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id AND a.deleted_at IS NULL)
  AND u.password_hash IS NOT NULL
  AND u.password_hash LIKE '$2%';

\echo '=== 5. Auth-backed users with sentinel / non-bcrypt hash ==='
SELECT count(*) AS sentinel_or_other
FROM public.users u
WHERE EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id AND a.deleted_at IS NULL)
  AND (u.password_hash IS NULL OR u.password_hash NOT LIKE '$2%');

\echo '=== 6. company_members.user_id missing auth.users ==='
SELECT count(*) AS memberships_without_auth
FROM gc_commerce.company_members m
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = m.user_id);

\echo '=== 7. password_reset_tokens.user_id missing auth.users ==='
SELECT count(*) AS reset_rows_without_auth
FROM public.password_reset_tokens t
WHERE t.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = t.user_id);

\echo '=== 8. Would fail Express login after removing bcrypt (Auth missing) ==='
SELECT count(*) AS would_fail_without_auth
FROM public.users u
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id AND a.deleted_at IS NULL);
