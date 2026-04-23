/**
 * Publish API uses canonical path (runPublish / syncProductAttributesFromStaged).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/review/data", () => ({
  getStagingById: vi.fn(),
}));
vi.mock("@/lib/publish/publish-service", () => ({
  buildPublishInputFromStaged: vi.fn(),
  runPublish: vi.fn(),
}));
vi.mock("@/lib/review/publish-guards", () => ({
  evaluatePublishReadiness: vi.fn(),
}));

import { POST } from "./route";
import { getStagingById } from "@/lib/review/data";
import { buildPublishInputFromStaged, runPublish } from "@/lib/publish/publish-service";
import { evaluatePublishReadiness } from "@/lib/review/publish-guards";
import type { PublishReadiness } from "@/lib/review/publish-guards";

const MOCK_READY: PublishReadiness = {
  canPublish: true,
  blockers: [],
  warnings: [],
  categorySlug: "disposable_gloves",
  categoryRequirementsEnforced: true,
  blockerSections: {
    workflow: [],
    staging_validation: [],
    missing_required_attributes: [],
    case_pricing: [],
  },
  postClickPipelineNotes: [],
};

describe("POST /api/publish", () => {
  beforeEach(() => {
    vi.mocked(getStagingById).mockReset();
    vi.mocked(buildPublishInputFromStaged).mockReset();
    vi.mocked(runPublish).mockReset();
    vi.mocked(evaluatePublishReadiness).mockReset();
    vi.mocked(evaluatePublishReadiness).mockResolvedValue(MOCK_READY);
  });

  it("uses getStagingById and runPublish for each staging id (canonical path)", async () => {
    const stagingId = "a1b2c3d4-e5f6-7890-abcd-ef1111111111";
    vi.mocked(getStagingById).mockResolvedValue({
      id: stagingId,
      status: "approved",
      master_product_id: "master-1",
      supplier_id: "sup-1",
      raw_id: "raw-1",
      normalized_data: {},
      attributes: {},
    } as never);
    vi.mocked(buildPublishInputFromStaged).mockReturnValue({
      normalizedId: stagingId,
      masterProductId: "master-1",
      stagedContent: {},
      stagedFilterAttributes: {},
      categorySlug: "disposable_gloves",
      supplierId: "sup-1",
      rawId: "raw-1",
    } as never);
    vi.mocked(runPublish).mockResolvedValue({ success: true } as never);

    const req = new Request("http://localhost/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staging_ids: [stagingId] }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.published).toBe(1);
    expect(data.errors).toEqual([]);
    expect(getStagingById).toHaveBeenCalledWith(stagingId);
    expect(buildPublishInputFromStaged).toHaveBeenCalled();
    expect(runPublish).toHaveBeenCalled();
  });

  it("skips runPublish when evaluatePublishReadiness blocks", async () => {
    const stagingId = "a1b2c3d4-e5f6-7890-abcd-ef3333333333";
    vi.mocked(getStagingById).mockResolvedValue({
      id: stagingId,
      status: "approved",
      master_product_id: "master-1",
      supplier_id: "sup-1",
      raw_id: "raw-1",
      normalized_data: {},
      attributes: {},
    } as never);
    vi.mocked(evaluatePublishReadiness).mockResolvedValue({
      ...MOCK_READY,
      canPublish: false,
      blockers: ["Normalized name is required for publish."],
      warnings: [],
      blockerSections: {
        ...MOCK_READY.blockerSections,
        staging_validation: ["Normalized name is required for publish."],
      },
    });

    const req = new Request("http://localhost/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staging_ids: [stagingId] }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(data.published).toBe(0);
    expect(data.errors[0]).toMatch(/Normalized name/);
    expect(runPublish).not.toHaveBeenCalled();
  });

  it("returns errors for non-approved rows", async () => {
    const stagingId = "a1b2c3d4-e5f6-7890-abcd-ef2222222222";
    vi.mocked(getStagingById).mockResolvedValue({
      id: stagingId,
      status: "pending",
      master_product_id: null,
    } as never);

    const req = new Request("http://localhost/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staging_ids: [stagingId] }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(data.published).toBe(0);
    expect(Array.isArray(data.errors) && data.errors.length > 0).toBe(true);
    expect(data.errors[0]).toMatch(/not approved|pending/);
    expect(runPublish).not.toHaveBeenCalled();
  });
});
