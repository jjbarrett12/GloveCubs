import { describe, expect, it } from "vitest";
import { stagingLandedCostFields } from "@/lib/pricing/landed-cost-provenance";
import { buildPublishInputFromStaged } from "@/lib/publish/publish-service";
import type { InsertQuickAddStagingRowInput } from "@/lib/ingestion/quick-add-staging-insert";
import { createEmptyFamilyDraft, syncDraftSizes } from "./draft";
import { deriveFamilyGloveCubsSkus } from "./sku-assist";
import { promoteFamilyToStaging, type ExistingFamilyPromotion, type FamilyPromotionPort } from "./promote";
import { buildFamilyStagingPlan } from "./staging-plan";
import type { FamilySizeSlug, NewProductFamilyDraft } from "./types";

const SUPPLIER = "550e8400-e29b-41d4-a716-446655440000";
const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY = "22222222-2222-4222-8222-222222222222";
const NO_COLLISIONS = { existingParentSkus: new Set<string>(), existingVariantSkus: new Set<string>() };

function readyDraft(sizes: FamilySizeSlug[] = ["s", "m", "l", "xl"]): NewProductFamilyDraft {
  let draft: NewProductFamilyDraft = {
    ...syncDraftSizes(createEmptyFamilyDraft(), sizes),
    brand: "GloveCubs",
    material: "nitrile",
    grade: "medical_exam_grade",
    color: "blue_violet",
    title: "GloveCubs Blue-Violet Nitrile Exam Gloves, Powder-Free, 4 mil",
    powder: "powder_free",
    thicknessMil: "4",
    cuffStyle: "beaded_cuff",
    aql: "aql_1_5",
    supplierId: SUPPLIER,
    costSourceType: "supplier_quote",
    costSourceReference: "Q-100",
    quotedCaseCost: 40,
    landedCaseCost: 48,
    landedCostConfirmed: true,
    imageUrl: "https://cdn.example.com/violet-nitrile.jpg",
    supplierSkuMirrorsManufacturer: false,
    packaging: { unitsPerInner: 100, innersPerCase: 10, casesPerPallet: 40 },
  };
  for (const size of sizes) {
    const manufacturerSku = `GL-N125F-${size.toUpperCase()}`;
    draft = {
      ...draft,
      variants: {
        ...draft.variants,
        [size]: {
          size,
          manufacturerSku,
          supplierSku: `SUP-${size.toUpperCase()}`,
          gtin: "",
          manufacturerConfirmed: true,
          suggestedManufacturerSku: null,
        },
      },
    };
  }
  return draft;
}

function memoryPort(options?: {
  failNormalizedAt?: number;
  failAnnotateAt?: number;
  failMaster?: boolean;
  failLinkAt?: number;
  failBatchDelete?: boolean;
  preexisting?: ExistingFamilyPromotion;
  loseClaim?: boolean;
  missExistingOnFind?: boolean;
}) {
  const batches = new Map<string, ExistingFamilyPromotion>();
  if (options?.preexisting?.batchId) {
    batches.set(options.preexisting.batchId, {
      batchId: options.preexisting.batchId,
      rows: options.preexisting.rows.map((row) => ({ ...row })),
    });
  }
  const state: ExistingFamilyPromotion = { batchId: "", rows: [] };
  let batchSeq = batches.size;
  let rowSeq = 0;
  const calls = { createBatch: 0, insert: 0, createMaster: 0, linkSibling: 0, discardMaster: 0 };
  const discardedMasters: string[] = [];
  const inserts: InsertQuickAddStagingRowInput[] = [];
  function active(): ExistingFamilyPromotion {
    return batches.get(state.batchId) ?? state;
  }
  let finds = 0;
  const port: FamilyPromotionPort = {
    async findByDraftId() {
      finds += 1;
      if (options?.missExistingOnFind && finds === 1) return null;
      const first = [...batches.values()][0];
      if (!first?.batchId) return null;
      return { batchId: first.batchId, rows: first.rows.map((row) => ({ ...row })) };
    },
    async createBatch() {
      calls.createBatch += 1;
      batchSeq += 1;
      const batchId = `batch-${batchSeq}`;
      const created = { batchId, rows: [] as ExistingFamilyPromotion["rows"] };
      batches.set(batchId, created);
      state.batchId = batchId;
      state.rows = created.rows;
      return { ok: true, batchId };
    },
    async claimDraft(_draftId, batchId) {
      const ids = [...batches.keys()];
      if (options?.loseClaim && ids[0] !== batchId) {
        batches.delete(batchId);
        const winner = batches.get(ids[0]!);
        return { won: false as const, winner: winner ? { batchId: winner.batchId, rows: winner.rows.map((row) => ({ ...row })) } : null };
      }
      return { won: true as const };
    },
    async insertRow(input) {
      calls.insert += 1;
      inserts.push(input);
      if (options?.failNormalizedAt != null && calls.insert === options.failNormalizedAt) {
        return { success: false, error: "normalized insert failed" };
      }
      rowSeq += 1;
      const normalizedId = `norm-${rowSeq}`;
      const rawId = `raw-${rowSeq}`;
      active().rows.push({ id: normalizedId, rawId, masterProductId: null });
      return { success: true, rawId, normalizedId };
    },
    async annotateRow() {
      if (options?.failAnnotateAt != null && calls.insert === options.failAnnotateAt) {
        return { ok: false, error: "annotate failed" };
      }
      return { ok: true };
    },
    async deleteNormalized(id) {
      for (const batch of batches.values()) batch.rows = batch.rows.filter((row) => row.id !== id);
      return { ok: true };
    },
    async deleteRaw(id) {
      for (const batch of batches.values()) batch.rows = batch.rows.filter((row) => row.rawId !== id);
      return { ok: true };
    },
    async deleteBatch(id) {
      if (options?.failBatchDelete) return { ok: false, error: "batch delete failed" };
      batches.delete(id);
      if (state.batchId === id) {
        state.batchId = "";
        state.rows = [];
      }
      return { ok: true };
    },
    async createMaster() {
      calls.createMaster += 1;
      if (options?.failMaster) return { ok: false, error: "master insert failed" };
      const masterProductId = "master-1";
      const row = active().rows[0];
      if (row) row.masterProductId = masterProductId;
      return { ok: true, masterProductId };
    },
    async linkSibling(normalizedId, masterProductId) {
      calls.linkSibling += 1;
      if (options?.failLinkAt != null && calls.linkSibling === options.failLinkAt) {
        return { ok: false, error: "sibling link failed" };
      }
      const row = active().rows.find((item) => item.id === normalizedId);
      if (row) row.masterProductId = masterProductId;
      return { ok: true };
    },
    async discardMaster(masterProductId) {
      calls.discardMaster += 1;
      discardedMasters.push(masterProductId);
      return { ok: true };
    },
  };
  return { port, calls, inserts, state, batches, discardedMasters };
}

describe("family staging promotion", () => {
  it("builds only the selected sizes and keeps quoted cost off the landed cost", () => {
    const plan = buildFamilyStagingPlan(readyDraft(["s", "m", "l"]), DRAFT_ID, NO_COLLISIONS);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.rows.map((row) => row.sizeCode)).toEqual(["S", "M", "L"]);
    expect(plan.rows.some((row) => row.sizeCode === "XL")).toBe(false);
    const derived = deriveFamilyGloveCubsSkus(readyDraft(["s", "m", "l"]));
    expect(plan.rows.map((row) => row.variantSku)).toEqual(["s", "m", "l"].map((size) => derived.bySize[size as FamilySizeSlug]));
    expect(plan.rows[0]?.quotedCaseCost).toBe(40);
    expect(plan.rows[0]?.landedCaseCost).toBe(48);
    expect(JSON.stringify(plan.rows[0]?.normalizedDataExtra)).not.toMatch(/sell_price/);
    const packaging = plan.rows[0]?.normalizedDataExtra.commerce_packaging as { case_price: number | null; pallet_price: number | null; cases_per_pallet: number | null };
    expect(packaging.case_price).toBeNull();
    expect(packaging.pallet_price).toBeNull();
    expect(packaging.cases_per_pallet).toBe(40);
    expect(plan.rows[0]?.supplierSku).toBe("SUP-S");
  });

  it("blocks duplicate variant SKUs and untrusted landed cost before any insert", async () => {
    const draft = readyDraft();
    const derived = deriveFamilyGloveCubsSkus(draft);
    const collision = buildFamilyStagingPlan(draft, DRAFT_ID, {
      existingParentSkus: new Set(),
      existingVariantSkus: new Set([derived.bySize.s!]),
    });
    expect(collision.ok).toBe(false);

    const memory = memoryPort();
    const untrusted = await promoteFamilyToStaging({
      draft: { ...draft, landedCostConfirmed: false },
      draftId: DRAFT_ID,
      categoryId: CATEGORY,
      collisions: NO_COLLISIONS,
      port: memory.port,
    });
    expect(untrusted.success).toBe(false);
    expect(memory.calls.createBatch).toBe(0);
    expect(memory.calls.createMaster).toBe(0);
  });

  it("creates one shared master for four sizes and does not insert again on retry", async () => {
    const memory = memoryPort();
    const first = await promoteFamilyToStaging({
      draft: readyDraft(),
      draftId: DRAFT_ID,
      categoryId: CATEGORY,
      collisions: NO_COLLISIONS,
      port: memory.port,
    });
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.normalizedIds).toHaveLength(4);
    expect(first.plan.rows).toHaveLength(4);
    expect(memory.calls.createMaster).toBe(1);
    expect(memory.calls.linkSibling).toBe(3);
    expect(memory.state.rows.every((row) => row.masterProductId === first.masterProductId)).toBe(true);
    expect(memory.inserts.every((row) => row.supplierId === SUPPLIER && row.landed_cost_trusted === true)).toBe(true);
    expect(memory.inserts.map((row) => row.normalizedDataExtra?.supplier_sku)).toEqual(["SUP-S", "SUP-M", "SUP-L", "SUP-XL"]);
    expect(JSON.stringify(memory.inserts)).not.toMatch(/sell_price/);

    const second = await promoteFamilyToStaging({
      draft: readyDraft(),
      draftId: DRAFT_ID,
      categoryId: CATEGORY,
      collisions: NO_COLLISIONS,
      port: memory.port,
    });
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.alreadyExisted).toBe(true);
    expect(second.masterProductId).toBe(first.masterProductId);
    expect(memory.calls.createBatch).toBe(1);
  });

  it("rolls back earlier rows when a later normalized insert fails", async () => {
    const memory = memoryPort({ failNormalizedAt: 2 });
    const result = await promoteFamilyToStaging({
      draft: readyDraft(),
      draftId: DRAFT_ID,
      categoryId: CATEGORY,
      collisions: NO_COLLISIONS,
      port: memory.port,
    });
    expect(result.success).toBe(false);
    expect(memory.state.batchId).toBe("");
    expect(memory.state.rows).toHaveLength(0);
    expect(memory.calls.createMaster).toBe(0);
  });

  it("hands a cost-only staging row to the existing publish input builder", () => {
    const plan = buildFamilyStagingPlan(readyDraft(), DRAFT_ID, NO_COLLISIONS);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const row = plan.rows[0]!;
    const landed = stagingLandedCostFields({
      cost: row.landedCaseCost,
      sourceType: plan.costSourceType,
      sourceReference: plan.costSourceReference,
      updatedBy: "admin",
      trusted: true,
    });
    const normalized_data: Record<string, unknown> = {
      name: row.name,
      canonical_title: row.name,
      supplier_sku: row.variantSku,
      sku: row.variantSku,
      category_slug: plan.categorySlug,
      filter_attributes: {},
      ...landed,
      pricing: { sell_unit: "case", normalized_case_cost: row.landedCaseCost },
      quick_add: true,
      ...row.normalizedDataExtra,
    };
    const input = buildPublishInputFromStaged(
      "33333333-3333-4333-8333-333333333333",
      {
        normalized_data,
        supplier_id: SUPPLIER,
        raw_id: "44444444-4444-4444-8444-444444444444",
        master_product_id: "55555555-5555-4555-8555-555555555555",
      },
      {}
    );
    expect(input).not.toBeNull();
    expect(input?.pricingCaseCostUnavailable).toBeUndefined();
    expect(input?.overrideSellPrice).toBeNull();
    expect(input?.stagedContent.supplier_cost).toBe(48);
    expect(input?.stagedContent.supplier_sku).toBe("SUP-S");
    expect(input?.stagedContent.images).toEqual(["https://cdn.example.com/violet-nitrile.jpg"]);
    expect(input?.stagedFilterAttributes.size).toBe("S");
    expect(JSON.stringify(normalized_data)).not.toMatch(/sell_price/);
    const proposals = normalized_data.sku_proposals as { applied_variant_skus: Record<string, string> };
    expect(proposals.applied_variant_skus.S).toBe(row.variantSku);
  });

  it("removes every size when the first, a middle, or the last row fails", async () => {
    for (const at of [1, 2, 4]) {
      const memory = memoryPort({ failNormalizedAt: at });
      const result = await promoteFamilyToStaging({
        draft: readyDraft(),
        draftId: DRAFT_ID,
        categoryId: CATEGORY,
        collisions: NO_COLLISIONS,
        port: memory.port,
      });
      expect(result.success).toBe(false);
      expect(memory.state.batchId).toBe("");
      expect([...memory.batches.values()]).toHaveLength(0);
      expect(memory.calls.createMaster).toBe(0);
    }
  });

  it("removes the draft catalog product when the master or a sibling link fails", async () => {
    const master = memoryPort({ failMaster: true });
    const masterResult = await promoteFamilyToStaging({
      draft: readyDraft(),
      draftId: DRAFT_ID,
      categoryId: CATEGORY,
      collisions: NO_COLLISIONS,
      port: master.port,
    });
    expect(masterResult.success).toBe(false);
    expect([...master.batches.values()]).toHaveLength(0);
    expect(master.discardedMasters).toEqual([]);

    const sibling = memoryPort({ failLinkAt: 2 });
    const siblingResult = await promoteFamilyToStaging({
      draft: readyDraft(),
      draftId: DRAFT_ID,
      categoryId: CATEGORY,
      collisions: NO_COLLISIONS,
      port: sibling.port,
    });
    expect(siblingResult.success).toBe(false);
    expect([...sibling.batches.values()]).toHaveLength(0);
    expect(sibling.discardedMasters).toEqual(["master-1"]);
  });

  it("clears an incomplete family and stages a complete one on retry", async () => {
    const memory = memoryPort({
      preexisting: {
        batchId: "batch-partial",
        rows: [{ id: "norm-old", rawId: "raw-old", masterProductId: "master-orphan" }],
      },
    });
    const result = await promoteFamilyToStaging({
      draft: readyDraft(),
      draftId: DRAFT_ID,
      categoryId: CATEGORY,
      collisions: NO_COLLISIONS,
      port: memory.port,
    });
    expect(result.success).toBe(true);
    expect(memory.discardedMasters).toEqual(["master-orphan"]);
    expect(memory.batches.has("batch-partial")).toBe(false);
    expect(memory.calls.createMaster).toBe(1);
    const kept = [...memory.batches.values()][0];
    expect(kept?.rows).toHaveLength(4);
    expect(kept?.rows.every((row) => row.masterProductId === "master-1")).toBe(true);
  });

  it("does not start a second family when another submission already owns the draft", async () => {
    const sizes = ["s", "m", "l", "xl"] as const;
    const complete = memoryPort({
      preexisting: {
        batchId: "batch-1",
        rows: sizes.map((size, index) => ({
          id: `norm-${index}`,
          rawId: `raw-${index}`,
          masterProductId: "master-1",
        })),
      },
      missExistingOnFind: true,
      loseClaim: true,
    });
    const adopted = await promoteFamilyToStaging({
      draft: readyDraft(),
      draftId: DRAFT_ID,
      categoryId: CATEGORY,
      collisions: NO_COLLISIONS,
      port: complete.port,
    });
    expect(adopted.success).toBe(true);
    if (!adopted.success) return;
    expect(adopted.alreadyExisted).toBe(true);
    expect(adopted.masterProductId).toBe("master-1");
    expect(complete.calls.createMaster).toBe(0);
    expect(complete.batches.has("batch-1")).toBe(true);
    expect([...complete.batches.keys()].filter((id) => id !== "batch-1")).toHaveLength(0);

    const running = memoryPort({
      preexisting: {
        batchId: "batch-1",
        rows: [{ id: "norm-1", rawId: "raw-1", masterProductId: null }],
      },
      missExistingOnFind: true,
      loseClaim: true,
    });
    const blocked = await promoteFamilyToStaging({
      draft: readyDraft(),
      draftId: DRAFT_ID,
      categoryId: CATEGORY,
      collisions: NO_COLLISIONS,
      port: running.port,
    });
    expect(blocked.success).toBe(false);
    if (blocked.success) return;
    expect(blocked.error).toMatch(/already running/);
    expect(running.batches.has("batch-1")).toBe(true);
    expect(running.calls.createMaster).toBe(0);
    expect(running.discardedMasters).toEqual([]);
  });

  it("reports cleanup failure instead of hiding a partial family", async () => {
    const memory = memoryPort({ failNormalizedAt: 2, failBatchDelete: true });
    const result = await promoteFamilyToStaging({
      draft: readyDraft(),
      draftId: DRAFT_ID,
      categoryId: CATEGORY,
      collisions: NO_COLLISIONS,
      port: memory.port,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/Cleanup failed: batch delete failed/);
  });

  it("lets the database unique constraint decide when two submissions overlap", async () => {
    let entered = 0;
    let release: (() => void) | undefined;
    const bothInside = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slot = new Map<string, ExistingFamilyPromotion>();
    const calls = { createMaster: 0 };
    function portFor(label: string): FamilyPromotionPort {
      const owned: ExistingFamilyPromotion = { batchId: "", rows: [] };
      return {
        async findByDraftId() {
          const winner = [...slot.values()][0];
          return winner ? { batchId: winner.batchId, rows: winner.rows.map((row) => ({ ...row })) } : null;
        },
        async createBatch() {
          entered += 1;
          if (entered === 2) release?.();
          await bothInside;
          if (slot.size > 0) return { ok: false, conflict: true };
          const batch: ExistingFamilyPromotion = {
            batchId: `batch-${label}`,
            rows: [],
          };
          slot.set(DRAFT_ID, batch);
          owned.batchId = batch.batchId;
          owned.rows = batch.rows;
          return { ok: true, batchId: batch.batchId };
        },
        async claimDraft() {
          return { won: true };
        },
        async insertRow() {
          const id = `${label}-${owned.rows.length + 1}`;
          owned.rows.push({ id, rawId: `raw-${id}`, masterProductId: null });
          return { success: true, rawId: `raw-${id}`, normalizedId: id };
        },
        async annotateRow() {
          return { ok: true };
        },
        async deleteNormalized() {
          return { ok: true };
        },
        async deleteRaw() {
          return { ok: true };
        },
        async deleteBatch() {
          return { ok: true };
        },
        async createMaster() {
          calls.createMaster += 1;
          const row = owned.rows[0];
          if (row) row.masterProductId = "master-race";
          return { ok: true, masterProductId: "master-race" };
        },
        async linkSibling(normalizedId, masterProductId) {
          const row = owned.rows.find((item) => item.id === normalizedId);
          if (row) row.masterProductId = masterProductId;
          return { ok: true };
        },
        async discardMaster() {
          return { ok: true };
        },
      };
    }

    const [first, second] = await Promise.all([
      promoteFamilyToStaging({
        draft: readyDraft(),
        draftId: DRAFT_ID,
        categoryId: CATEGORY,
        collisions: NO_COLLISIONS,
        port: portFor("a"),
      }),
      promoteFamilyToStaging({
        draft: readyDraft(),
        draftId: DRAFT_ID,
        categoryId: CATEGORY,
        collisions: NO_COLLISIONS,
        port: portFor("b"),
      }),
    ]);
    const results = [first, second];
    expect(slot.size).toBe(1);
    expect(calls.createMaster).toBe(1);
    expect(results.filter((result) => result.success).length).toBe(1);
    expect(results.filter((result) => !result.success).length).toBe(1);
    const blocked = results.find((result) => !result.success);
    expect(blocked && !blocked.success ? blocked.error : "").toMatch(/already running/);
    const winner = [...slot.values()][0];
    expect(winner?.rows).toHaveLength(4);
    expect(winner?.rows.every((row) => row.masterProductId === "master-race")).toBe(true);
  });
});
