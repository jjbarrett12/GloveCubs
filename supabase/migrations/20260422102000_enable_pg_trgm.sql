-- Blank-project prerequisite for storefront trigram search.
-- 20260422103000 creates GIN(name gin_trgm_ops) and uses similarity();
-- 20260701100000 also uses similarity(). Neither enables pg_trgm.
-- Match repository convention used for pgcrypto (unqualified CREATE EXTENSION).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
