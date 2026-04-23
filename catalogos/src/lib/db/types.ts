/**
 * Regenerate full types: from repo root, `npm run gen:db-types` (writes `database.from-remote.ts` in storefront).
 * For CatalogOS-only regeneration, point the script at this package or duplicate the script with catalogos output path.
 *
 * Today: permissive `Database` + strict `CatalogosProductRow` from `./database.manual`.
 */
export type {
  CatalogosProductRow,
  Database,
  Json,
} from "./database.manual";
