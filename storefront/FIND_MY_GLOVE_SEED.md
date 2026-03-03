# Find My Glove — Seed & Run

## 1. Supabase migration

Run the Find My Glove migration so tables and seed data exist.

**Option A — Supabase Dashboard (SQL Editor)**  
1. Open your project → SQL Editor.  
2. Paste and run the contents of:
   - `supabase/migrations/20260303000001_find_my_glove_tables.sql`  
   (from the **project root**, not inside `storefront/`.)

**Option B — Supabase CLI**  
From the project root:

```bash
supabase db push
```

Or run the migration file manually:

```bash
supabase db execute -f supabase/migrations/20260303000001_find_my_glove_tables.sql
```

## 2. Environment variables (storefront)

In `storefront/.env.local` (or your env source):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# Optional: for AI-powered recommendations
OPENAI_API_KEY=sk-...
```

Use the **service role** key for the API (server-side only). For read-only use cases you can use `NEXT_PUBLIC_SUPABASE_ANON_KEY` if RLS allows public read on the glove tables.

## 3. Add more glove products

The migration seeds a few sample rows in `glove_products`. To get useful recommendations:

- Insert more rows via Supabase Table Editor, or  
- Use SQL in the SQL Editor, e.g.:

```sql
INSERT INTO glove_products (
  sku, name, description, glove_type, material, thickness_mil, cut_level,
  chemical_resistance, food_safe, medical_grade, durability_score, dexterity_score, protection_score, price_cents, active
) VALUES (
  'YOUR-SKU', 'Product Name', 'Description', 'disposable', 'nitrile', 6, null,
  '{"disinfectants":"high"}'::jsonb, true, false, 50, 70, 60, 1999, true
);
```

## 4. Run storefront

```bash
cd storefront
npm install
npm run dev
```

- **Find My Glove:** http://localhost:3000/find-my-glove  
- **Use cases API:** http://localhost:3000/api/gloves/use-cases  
- **Recommend API:** `POST http://localhost:3000/api/gloves/recommend` with body `{ "useCaseKey": "cleaning_disinfecting", "answers": { ... } }`

## 5. Tests

```bash
cd storefront
npm run test
```

Runs `src/lib/gloves/scoring.test.ts` (Vitest).
