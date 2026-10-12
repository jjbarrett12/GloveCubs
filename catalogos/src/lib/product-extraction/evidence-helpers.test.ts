import { describe, expect, it } from "vitest";
import { makeFieldEvidence, trustFromConfidence } from "./evidence-helpers";

describe("makeFieldEvidence trust", () => {
  it("derives trust from confidence when no override is passed", () => {
    expect(trustFromConfidence(0.85)).toBe("trusted");
    expect(trustFromConfidence(0.65)).toBe("probable");
    expect(trustFromConfidence(0.4)).toBe("weak");
    expect(trustFromConfidence(0.2)).toBe("missing");
    expect(trustFromConfidence(0)).toBe("missing");
    expect(makeFieldEvidence("nitrile", 0.9, "table").trust).toBe("trusted");
  });

  it("keeps an explicit trust override", () => {
    const evidence = makeFieldEvidence("unknown", 0.9, "heuristic", { trust: "weak", quote: "glove" });
    expect(evidence.trust).toBe("weak");
    expect(evidence.value).toBe("unknown");
    expect(evidence.confidence).toBe(0.9);
    expect(evidence.source).toBe("heuristic");
    expect(evidence.quote).toBe("glove");
  });
});
