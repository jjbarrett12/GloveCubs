import { describe, it, expect } from "vitest";
import {
  assertIngestionJobTransition,
  canTransitionIngestionJob,
} from "../../../../../lib/unified-ingestion/state-machine";

describe("ingestion job state machine", () => {
  it("allows happy path to review_ready", () => {
    expect(canTransitionIngestionJob("queued", "fetching")).toBe(true);
    expect(canTransitionIngestionJob("fetching", "extracting")).toBe(true);
    expect(canTransitionIngestionJob("extracting", "normalized")).toBe(true);
    expect(canTransitionIngestionJob("normalized", "review_ready")).toBe(true);
  });

  it("allows awaiting_human branch", () => {
    expect(canTransitionIngestionJob("normalized", "awaiting_human")).toBe(true);
    expect(canTransitionIngestionJob("awaiting_human", "review_ready")).toBe(true);
  });

  it("rejects skipping states", () => {
    expect(canTransitionIngestionJob("queued", "review_ready")).toBe(false);
  });

  it("assert throws on invalid transition", () => {
    expect(() => assertIngestionJobTransition("failed", "review_ready")).toThrow(/Invalid/);
  });
});
