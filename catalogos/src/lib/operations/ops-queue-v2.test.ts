import { describe, it, expect } from "vitest";

function bucketByAge(createdAts: string[]): { within1d: number; within3d: number; within7dPlus: number } {
  const MS_1D = 24 * 60 * 60 * 1000;
  const MS_3D = 3 * MS_1D;
  const now = Date.now();
  let within1d = 0;
  let within3d = 0;
  let within7dPlus = 0;
  for (const at of createdAts) {
    const age = now - new Date(at).getTime();
    if (age <= MS_1D) within1d++;
    else if (age <= MS_3D) within3d++;
    else within7dPlus++;
  }
  return { within1d, within3d, within7dPlus };
}

describe("ops-queue-v2 aging buckets", () => {
  it("buckets items by age correctly", () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const result = bucketByAge([oneHourAgo, twoDaysAgo, tenDaysAgo]);
    expect(result.within1d).toBe(1);
    expect(result.within3d).toBe(1);
    expect(result.within7dPlus).toBe(1);
  });

  it("returns zeros for empty array", () => {
    const result = bucketByAge([]);
    expect(result.within1d).toBe(0);
    expect(result.within3d).toBe(0);
    expect(result.within7dPlus).toBe(0);
  });
});
