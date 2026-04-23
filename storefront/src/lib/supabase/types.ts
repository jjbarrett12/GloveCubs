/**
 * Supabase client `Database` generic.
 *
 * After you run `npm run gen:db-types` (requires DATABASE_URL), review
 * `database.from-remote.ts` and switch this file to:
 *   `export type { Database, Json } from "./database.from-remote";`
 * then re-export commerce row types from `database.manual.ts` if still needed.
 */
export type {
  Database,
  Json,
  CartItemStored,
  CanonicalProductRow,
  CartsRow,
  InventoryRow,
  OrderItemRow,
  OrdersRow,
  ProductsRow,
} from "./database.manual";
