/**
 * @deprecated V2 — removed. Legacy numeric staging synced to public.products.
 * Use POST /api/publish with supplier_products_normalized + runPublish.
 */

export interface PublishInput {
  staging_ids: number[];
  published_by?: string;
}

export interface PublishResult {
  published: number;
  errors: string[];
}

export async function publishStaging(input: PublishInput): Promise<PublishResult> {
  const msg =
    "legacy publishStaging removed in V2 — use POST /api/publish (catalogos.products only; no public.products).";
  return {
    published: 0,
    errors: input.staging_ids.map((id) => `Staging ${id}: ${msg}`),
  };
}
