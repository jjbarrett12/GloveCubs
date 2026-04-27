/**
 * Chooses `supplier_products_raw.external_id` for CSV bulk import.
 * - First row with a given non-empty SKU uses that SKU, unless the string is already used as an external_id in this batch.
 * - Otherwise uses `csv_bulk:<batchId>:row:<sourceRowIndex>` (deterministic). If that string is already taken (e.g. same literal SKU earlier, or rare collision), appends `:<uuid>` until unique.
 *
 * Mutates `assignedExternalIds` with the returned id.
 */
export function allocateBulkCsvExternalId(
  batchId: string,
  sourceRowIndex: number,
  trimmedSku: string,
  assignedExternalIds: Set<string>
): string {
  if (trimmedSku && !assignedExternalIds.has(trimmedSku)) {
    assignedExternalIds.add(trimmedSku);
    return trimmedSku;
  }

  const base = `csv_bulk:${batchId}:row:${sourceRowIndex}`;
  let candidate = base;
  if (!assignedExternalIds.has(candidate)) {
    assignedExternalIds.add(candidate);
    return candidate;
  }

  do {
    candidate = `${base}:${crypto.randomUUID()}`;
  } while (assignedExternalIds.has(candidate));

  assignedExternalIds.add(candidate);
  return candidate;
}
