import { getFamilyReviewGroupsForBatch } from "@/lib/review/family-review";
import { hasFamilyConflict } from "@/lib/review/family-review-types";
import type { StagingRow } from "@/lib/review/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FamilyFirstReviewClient,
  type FamilyReviewGroupDTO,
  type FamilyReviewRowDTO,
} from "./FamilyFirstReviewClient";

function toFamilyRowDTO(r: StagingRow): FamilyReviewRowDTO {
  const nd = r.normalized_data as {
    supplier_sku?: string;
    sku?: string;
    canonical_title?: string;
    name?: string;
  };
  const sku = nd?.supplier_sku ?? nd?.sku ?? r.id.slice(0, 8);
  const title = (nd?.canonical_title ?? nd?.name ?? "").slice(0, 200);
  return {
    id: r.id,
    status: r.status,
    sku,
    variant_axis: r.variant_axis ?? null,
    variant_value: r.variant_value ?? null,
    inferred_size: r.inferred_size ?? null,
    title,
    ai_match_status: r.ai_match_status ?? null,
    ai_match_queue_reason: r.ai_match_queue_reason ?? null,
    ai_confidence: r.ai_confidence != null ? Number(r.ai_confidence) : null,
    ai_suggested_master_product_id: r.ai_suggested_master_product_id ?? null,
    ai_suggested_master_sku: r.ai_suggested_master_sku ?? null,
    ai_suggested_master_name: r.ai_suggested_master_name ?? null,
    master_product_id: r.master_product_id ?? null,
    master_sku: r.master_sku ?? null,
    match_confidence: r.match_confidence != null ? Number(r.match_confidence) : null,
  };
}

export default async function VariantFamiliesPanel({ batchId }: { batchId: string }) {
  const groups = await getFamilyReviewGroupsForBatch(batchId);
  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Variant families</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No multi-row variant groups detected yet. Run import through normalization (family inference runs after
          chunk ingest). SKUs like <code className="text-xs bg-muted px-1 rounded">GLV-N125S</code>–
          <code className="text-xs bg-muted px-1 rounded">XL</code> with matching attributes group by base stem and
          variant axis.
        </CardContent>
      </Card>
    );
  }

  const conflictFamilyCount = groups.filter((g) => hasFamilyConflict(g.operator)).length;

  const dto: FamilyReviewGroupDTO[] = groups.map((g) => ({
    family_group_key: g.family_group_key,
    inferred_base_sku: g.inferred_base_sku,
    variant_axis: g.variant_axis,
    confidence: g.confidence,
    variantCount: g.variantCount,
    family_group_meta: g.family_group_meta,
    operator: g.operator,
    rows: g.rows.map(toFamilyRowDTO),
  }));

  return (
    <FamilyFirstReviewClient
      batchId={batchId}
      groups={dto}
      conflictFamilyCount={conflictFamilyCount}
    />
  );
}
