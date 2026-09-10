import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireHumanBotId = vi.hoisted(() => vi.fn());
const checkPublicWriteRateLimit = vi.hoisted(() => vi.fn());
const checkAiRateLimit = vi.hoisted(() => vi.fn());
const chatCompletionPlain = vi.hoisted(() => vi.fn());
const runJsonResponse = vi.hoisted(() => vi.fn());
const aiInvoiceSavings = vi.hoisted(() => vi.fn());
const logRecoSession = vi.hoisted(() => vi.fn());
const logAiEvent = vi.hoisted(() => vi.fn());
const ensureGloveFinderOpportunity = vi.hoisted(() => vi.fn());
const appendGloveFinderAdvisoryEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/security/botid-gate", () => ({ requireHumanBotId }));
vi.mock("@/lib/security/public-write-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("./public-write-rate-limit")>(
    "./public-write-rate-limit",
  );
  return {
    ...actual,
    checkPublicWriteRateLimit,
  };
});
vi.mock("@/lib/ai/middleware", () => ({ checkAiRateLimit }));
vi.mock("@/lib/ai/provider", () => ({
  chatCompletionPlain,
  getOpenAIClient: () => null,
  aiInvoiceSavings,
}));
vi.mock("@/lib/ai/client", () => ({ runJsonResponse }));
vi.mock("@/lib/ai/telemetry", () => ({ logAiEvent }));
vi.mock("@/lib/gloves/queries", () => ({
  getActiveProducts: vi.fn(async () => []),
  getUseCaseRiskProfiles: vi.fn(async () => []),
  logRecoSession,
  prefilterProductsForRecommend: vi.fn(() => []),
}));
vi.mock("@/lib/procurement/spine-writes", () => ({
  ensureGloveFinderOpportunity,
  appendGloveFinderAdvisoryEvent,
}));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({}),
}));
vi.mock("@/lib/catalog/emergency-catalog-kill-switch", () => ({
  isPublicAiEmergencyDisabled: () => false,
  isCatalogSupabaseEmergencyDisabled: () => false,
}));
vi.mock("@/lib/observability/public-funnel-log", () => ({
  logPublicFunnel: vi.fn(),
}));
vi.mock("@/lib/http/public-post-guard", () => ({
  guardPublicJsonPost: () => null,
}));
vi.mock("@/lib/catalog/store-products", () => ({
  fetchStoreProductRowsByIds: vi.fn(async () => []),
}));
vi.mock("@/lib/ontology/prep-line-candidates", () => ({
  fetchRestaurantPrepLineCandidateProductIds: vi.fn(async () => ["p1"]),
}));

function jsonPost(path: string, body: unknown = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("public AI BotID fail-closed ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHumanBotId.mockResolvedValue({ ok: true });
    checkPublicWriteRateLimit.mockReturnValue(null);
    checkAiRateLimit.mockReturnValue({ allowed: true });
  });

  describe("POST /api/gloves/recommend", () => {
    it("bot → 403 before OpenAI / DB", async () => {
      requireHumanBotId.mockResolvedValue({
        ok: false,
        response: NextResponse.json({ code: "bot_rejected" }, { status: 403 }),
      });
      const { POST } = await import("@/app/api/gloves/recommend/route");
      const res = await POST(jsonPost("/api/gloves/recommend", { useCaseKey: "x", answers: {} }));
      expect(res.status).toBe(403);
      expect(chatCompletionPlain).not.toHaveBeenCalled();
      expect(logRecoSession).not.toHaveBeenCalled();
    });

    it("rate limit → 429 before OpenAI / DB", async () => {
      checkPublicWriteRateLimit.mockReturnValue(
        NextResponse.json({ code: "rate_limited" }, { status: 429 }),
      );
      const { POST } = await import("@/app/api/gloves/recommend/route");
      const res = await POST(jsonPost("/api/gloves/recommend", { useCaseKey: "x", answers: {} }));
      expect(res.status).toBe(429);
      expect(chatCompletionPlain).not.toHaveBeenCalled();
      expect(logRecoSession).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/ai/glove-finder", () => {
    it("bot → 403 before OpenAI / procurement writes", async () => {
      requireHumanBotId.mockResolvedValue({
        ok: false,
        response: NextResponse.json({ code: "bot_rejected" }, { status: 403 }),
      });
      const { POST } = await import("@/app/api/ai/glove-finder/route");
      const res = await POST(
        jsonPost("/api/ai/glove-finder", {
          operationalEnvironmentKey: "restaurant_prep_line",
          useCaseLabel: "prep",
          hazards: [],
          latexAllergy: false,
          clientTraceId: "trace-1",
        }),
      );
      expect(res.status).toBe(403);
      expect(runJsonResponse).not.toHaveBeenCalled();
      expect(ensureGloveFinderOpportunity).not.toHaveBeenCalled();
      expect(appendGloveFinderAdvisoryEvent).not.toHaveBeenCalled();
    });

    it("rate limit → 429 before OpenAI / procurement writes", async () => {
      checkAiRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 1000 });
      const { POST } = await import("@/app/api/ai/glove-finder/route");
      const res = await POST(
        jsonPost("/api/ai/glove-finder", {
          operationalEnvironmentKey: "restaurant_prep_line",
          useCaseLabel: "prep",
          hazards: [],
          latexAllergy: false,
        }),
      );
      expect(res.status).toBe(429);
      expect(runJsonResponse).not.toHaveBeenCalled();
      expect(ensureGloveFinderOpportunity).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/ai/invoice/recommend", () => {
    it("is disabled (410) and never calls OpenAI", async () => {
      const { POST } = await import("@/app/api/ai/invoice/recommend/route");
      const res = await POST();
      expect(res.status).toBe(410);
      const body = await res.json();
      expect(body.code).toBe("invoice_recommend_disabled");
      expect(aiInvoiceSavings).not.toHaveBeenCalled();
      expect(logAiEvent).not.toHaveBeenCalled();
    });
  });
});
