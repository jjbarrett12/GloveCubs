'use strict';

/**
 * PostgREST (Supabase Data API) returns PGRST106 when a schema is not listed under
 * Project Settings → API → Exposed schemas.
 */

function isPostgrestSchemaNotExposed(err) {
  if (!err) return false;
  if (err.code === 'PGRST106') return true;
  const msg = String(err.message || '');
  return msg.includes('Invalid schema') && msg.includes('exposed');
}

/**
 * @param {unknown} err
 * @returns {{ status: number, body: Record<string, unknown> }}
 */
function mapPostgrestOrDatabaseError(err) {
  if (isPostgrestSchemaNotExposed(err)) {
    return {
      status: 503,
      body: {
        error:
          'Catalog API blocked: Supabase PostgREST is not exposing the catalogos / catalog_v2 / gc_commerce schemas.',
        code: 'POSTGREST_SCHEMA_NOT_EXPOSED',
        fix:
          'Supabase Dashboard → Project Settings → API → Exposed schemas: add catalogos, catalog_v2, and gc_commerce, then save.',
      },
    };
  }
  return { status: 500, body: { error: 'Database error' } };
}

module.exports = { isPostgrestSchemaNotExposed, mapPostgrestOrDatabaseError };
