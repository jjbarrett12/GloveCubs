These CommonJS modules are copied from the repository root `lib/` directory
so Next.js on Vercel (storefront-only root) can resolve them at build time.

When changing active company resolution or the admin Supabase helper, update
both locations to stay in sync:
  ../lib/active-company-resolve.js
  ../lib/supabaseAdmin.js
