import type { InsertQuickAddStagingRowInput, InsertQuickAddStagingRowResult } from "@/lib/ingestion/quick-add-staging-insert";
import { buildFamilyStagingPlan, type FamilyStagingPlan, type FamilyStagingRowPlan } from "./staging-plan";
import type { SkuCollisionInput } from "./sku-assist";
import type { NewProductFamilyDraft } from "./types";

export type ExistingFamilyPromotion = {
  batchId: string;
  rows: Array<{ id: string; rawId: string | null; masterProductId: string | null }>;
};

export type PortResult = { ok: true } | { ok: false; error: string };

export type CreateFamilyBatchResult =
  | { ok: true; batchId: string }
  | { ok: false; conflict: true }
  | { ok: false; conflict?: false; error: string };

export type FamilyPromotionPort = {
  findByDraftId(draftId: string): Promise<ExistingFamilyPromotion | null>;
  /**
   * Inserts the draft batch. A conflict means the partial unique index already
   * has a batch for this New Product Family draft.
   */
  createBatch(draftId: string, supplierId: string): Promise<CreateFamilyBatchResult>;
  /**
   * After insert, keep the earliest batch for this draft and drop this batch when it is empty and later.
   * PostgREST cannot hold the check and the insert in one database transaction.
   */
  claimDraft(
    draftId: string,
    batchId: string
  ): Promise<{ won: true } | { won: false; winner: ExistingFamilyPromotion | null; error?: string }>;
  insertRow(input: InsertQuickAddStagingRowInput): Promise<InsertQuickAddStagingRowResult>;
  annotateRow(normalizedId: string, patch: Record<string, unknown>): Promise<PortResult>;
  deleteNormalized(id: string): Promise<PortResult>;
  deleteRaw(id: string): Promise<PortResult>;
  deleteBatch(id: string): Promise<PortResult>;
  /**
   * Creates one draft catalog product and links the anchor staging row.
   * Must not publish and must not write a customer list price.
   */
  createMaster(input: {
    normalizedId: string;
    sku: string;
    name: string;
    categoryId: string;
    brandId: string | null;
  }): Promise<{ ok: true; masterProductId: string } | { ok: false; error: string }>;
  linkSibling(normalizedId: string, masterProductId: string): Promise<PortResult>;
  /** Deletes a draft catalog product after its staging rows are gone. */
  discardMaster(masterProductId: string): Promise<PortResult>;
};

export type FamilyPromotionResult =
  | {
      success: true;
      batchId: string;
      masterProductId: string;
      normalizedIds: string[];
      alreadyExisted: boolean;
      plan: FamilyStagingPlan;
    }
  | { success: false; error: string };

function rowInsertInput(plan: FamilyStagingPlan, batchId: string, row: FamilyStagingRowPlan, index: number): InsertQuickAddStagingRowInput {
  return {
    batchId,
    supplierId: plan.supplierId,
    sourceRowIndex: index,
    externalId: row.externalId,
    rawPayload: row.rawPayload,
    sku: row.variantSku,
    name: row.name,
    category_slug: plan.categorySlug,
    normalized_case_cost: row.landedCaseCost,
    cost_source_type: plan.costSourceType,
    cost_source_reference: plan.costSourceReference,
    landed_cost_trusted: true,
    normalizedDataExtra: row.normalizedDataExtra,
  };
}

function isComplete(existing: ExistingFamilyPromotion, plan: FamilyStagingPlan): string | null {
  const masterIds = [
    ...new Set(existing.rows.map((row) => row.masterProductId).filter((id): id is string => Boolean(id))),
  ];
  if (
    existing.rows.length === plan.rows.length &&
    masterIds.length === 1 &&
    existing.rows.every((row) => row.masterProductId === masterIds[0])
  ) {
    return masterIds[0]!;
  }
  return null;
}

function succeeded(existing: ExistingFamilyPromotion, masterProductId: string, plan: FamilyStagingPlan): FamilyPromotionResult {
  return {
    success: true,
    batchId: existing.batchId,
    masterProductId,
    normalizedIds: existing.rows.map((row) => row.id),
    alreadyExisted: true,
    plan,
  };
}

async function removeFamily(
  port: FamilyPromotionPort,
  batchId: string,
  rows: Array<{ id: string; rawId: string | null; masterProductId: string | null }>,
  masterIds: string[]
): Promise<string | null> {
  const errors: string[] = [];
  for (const row of [...rows].reverse()) {
    if (row.id) {
      const normalized = await port.deleteNormalized(row.id);
      if (!normalized.ok) errors.push(normalized.error);
    }
    if (row.rawId) {
      const raw = await port.deleteRaw(row.rawId);
      if (!raw.ok) errors.push(raw.error);
    }
  }
  const batch = await port.deleteBatch(batchId);
  if (!batch.ok) errors.push(batch.error);
  for (const masterId of masterIds) {
    const discarded = await port.discardMaster(masterId);
    if (!discarded.ok) errors.push(discarded.error);
  }
  return errors.length > 0 ? errors.join("; ") : null;
}

export async function promoteFamilyToStaging(args: {
  draft: NewProductFamilyDraft;
  draftId: string;
  categoryId: string;
  collisions: SkuCollisionInput;
  port: FamilyPromotionPort;
}): Promise<FamilyPromotionResult> {
  const plan = buildFamilyStagingPlan(args.draft, args.draftId, args.collisions);
  if (!plan.ok) return { success: false, error: plan.error };
  if (!args.categoryId.trim()) return { success: false, error: "Category is required before staging." };

  let existing: ExistingFamilyPromotion | null;
  try {
    existing = await args.port.findByDraftId(args.draftId);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to look up this family" };
  }
  if (existing) {
    const masterProductId = isComplete(existing, plan);
    if (masterProductId) return succeeded(existing, masterProductId, plan);
    const masters = [
      ...new Set(existing.rows.map((row) => row.masterProductId).filter((id): id is string => Boolean(id))),
    ];
    const cleanup = await removeFamily(args.port, existing.batchId, existing.rows, masters);
    if (cleanup) {
      return {
        success: false,
        error: `Could not clear the incomplete family before retrying. ${cleanup}`,
      };
    }
  }

  let batchId: string;
  let created: CreateFamilyBatchResult;
  try {
    created = await args.port.createBatch(args.draftId, plan.supplierId);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create import batch" };
  }
  if (!created.ok) {
    if (created.conflict) {
      let winner: ExistingFamilyPromotion | null = null;
      try {
        winner = await args.port.findByDraftId(args.draftId);
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to look up the existing family" };
      }
      if (winner) {
        const masterProductId = isComplete(winner, plan);
        if (masterProductId) return succeeded(winner, masterProductId, plan);
      }
      return {
        success: false,
        error: "Another submission of this draft is already running. Wait, then send to review again.",
      };
    }
    return { success: false, error: created.error ?? "Failed to create import batch" };
  }
  batchId = created.batchId;

  let claim: Awaited<ReturnType<FamilyPromotionPort["claimDraft"]>>;
  try {
    claim = await args.port.claimDraft(args.draftId, batchId);
  } catch (e) {
    const cleanup = await removeFamily(args.port, batchId, [], []);
    const reason = e instanceof Error ? e.message : "Failed to claim this family submission";
    return { success: false, error: cleanup ? `${reason} Cleanup failed: ${cleanup}` : reason };
  }
  if (!claim.won) {
    if (claim.winner) {
      const masterProductId = isComplete(claim.winner, plan);
      if (masterProductId) return succeeded(claim.winner, masterProductId, plan);
    }
    const reason = claim.error ?? "Another submission of this draft is already running. Wait, then send to review again.";
    return { success: false, error: reason };
  }

  const createdRows: Array<{ id: string; rawId: string | null; masterProductId: string | null }> = [];
  let masterProductId: string | null = null;

  async function rollback(reason: string): Promise<FamilyPromotionResult> {
    const masters = masterProductId ? [masterProductId] : [];
    const cleanup = await removeFamily(args.port, batchId, createdRows, masters);
    return {
      success: false,
      error: cleanup ? `${reason} Cleanup failed: ${cleanup}` : reason,
    };
  }

  try {
    for (let i = 0; i < plan.rows.length; i++) {
      const row = plan.rows[i]!;
      const inserted = await args.port.insertRow(rowInsertInput(plan, batchId, row, i));
      if (!inserted.success) return rollback(inserted.error);
      createdRows.push({ id: inserted.normalizedId, rawId: inserted.rawId, masterProductId: null });
      const annotated = await args.port.annotateRow(inserted.normalizedId, {
        family_group_key: plan.familyGroupKey,
        inferred_base_sku: plan.parentSku,
        inferred_size: row.sizeCode,
        variant_axis: "size",
        variant_value: row.sizeCode,
      });
      if (!annotated.ok) return rollback(annotated.error);
    }

    const anchor = createdRows[0];
    if (!anchor) return rollback("No size rows were created.");
    const master = await args.port.createMaster({
      normalizedId: anchor.id,
      sku: plan.parentSku,
      name: plan.title,
      categoryId: args.categoryId,
      brandId: plan.brandId,
    });
    if (!master.ok) return rollback(master.error);
    masterProductId = master.masterProductId;
    anchor.masterProductId = master.masterProductId;

    for (const row of createdRows.slice(1)) {
      const linked = await args.port.linkSibling(row.id, master.masterProductId);
      if (!linked.ok) return rollback(linked.error);
      row.masterProductId = master.masterProductId;
    }
  } catch (e) {
    return rollback(e instanceof Error ? e.message : "Family staging failed");
  }

  return {
    success: true,
    batchId,
    masterProductId: masterProductId!,
    normalizedIds: createdRows.map((row) => row.id),
    alreadyExisted: false,
    plan,
  };
}
