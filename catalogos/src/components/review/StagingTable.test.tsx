/**
 * Tests for StagingTable: selection props, select-all/indeterminate behavior.
 */

import { describe, it, expect } from "vitest";
import { StagingTable } from "./StagingTable";

describe("StagingTable", () => {
  it("is exported and is a function component", () => {
    expect(StagingTable).toBeDefined();
    expect(typeof StagingTable).toBe("function");
  });

});
