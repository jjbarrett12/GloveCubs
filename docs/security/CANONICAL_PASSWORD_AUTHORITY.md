# Canonical customer password authority (Phase 1C)

## Canonical model

| Concern | Authority |
|---------|-----------|
| Customer password | **Supabase Auth** (`auth.users`) |
| Customer identity key | `auth.users.id` = `public.users.id` |
| Express API session | Custom JWT issued **after** Supabase password validation |
| CatalogOS admin | Shared secret (not customer passwords) |

## Deprecated

`public.users.password_hash` is **not** an active password validator for Supabase-backed customers.

- New creates write sentinel `!supabase_auth_only` (column is `NOT NULL`).
- Customer reset does **not** update `password_hash`.
- Express `/api/auth/login` uses `signInWithPassword` via anon-key client — **no bcrypt fallback**.

## Routes that no longer use bcrypt for customer auth

- `POST /api/auth/login`
- `POST /api/auth/register` (Auth create + sentinel hash)
- `POST /api/admin/users` create
- `POST /api/auth/reset-password` (Auth admin password + marker only)

## Storefront recovery

`/login/reset` uses Supabase `auth.updateUser({ password })` on a recovery session. That updates the same Auth credential Express validates. No `public.users.password_hash` sync is required.

## Legacy-only users

Users with a public profile and no Auth row fail closed at Express login (generic invalid credentials). Run:

```bash
psql "$DATABASE_URL" -f scripts/sql/auth-identity-dual-password-audit.sql
```

Migrate those users to Auth before launch. No default bcrypt fallback.

## Dual-password elimination

After Phase 1C:

- Express login cannot accept a stale bcrypt hash when Supabase rejects the password (no fallback).
- Customer reset success requires Auth password update; Auth failure resurrects the token and returns an error.
- Native storefront recovery and Express reset both change Supabase Auth only — Express login then uses that credential.
- New creates write sentinel `!supabase_auth_only`, not a bcrypt authority.

## Authentication authority matrix

| Surface | Current validator (1C) | Session issuer | Notes |
|---------|------------------------|----------------|-------|
| Next storefront login | Supabase `signInWithPassword` | Supabase session | Production customer path |
| Customer portal (legacy SPA) | Redirected / same Auth where used | — | Prefer Next |
| Storefront password recovery | Supabase `updateUser({ password })` | Recovery session → Auth | Same credential as Express |
| Express `/api/auth/login` | Supabase `signInWithPassword` (anon) | Custom JWT | JWT `id` = Auth UUID |
| Express JWT APIs | JWT verify | N/A (already issued) | Not re-checked against password |
| Express password-reset | Auth admin `updateUserById` | N/A | No profile hash write |
| User registration | Auth `createUser` + sentinel | N/A | |
| Admin-created users | Auth `createUser` + sentinel | N/A | |
| Customer invitations | (if present) must use Auth) | — | Audit before launch |
| CatalogOS administrator | Shared secret / CatalogOS auth | CatalogOS | Not customer passwords |
| Bootstrap admin script | Auth password + sentinel | — | No bcrypt parallel write |

## Seed / local demos

`seed.js` may still write bcrypt hashes for local demo data. Those hashes are **not** validated by Express login after Phase 1C; seed users need Auth rows with matching passwords for login smoke.

## Rollback

Reverting Phase 1C restores bcrypt login. Prefer forward-fix: keep Auth canonical. Historical bcrypt hashes may remain in the column until a later drop migration.

## Conditions to drop `password_hash`

1. Audit shows zero Auth-backed users requiring bcrypt.
2. No code path validates the column.
3. Explicit migration + release notes.
