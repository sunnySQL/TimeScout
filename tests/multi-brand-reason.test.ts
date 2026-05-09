import { describe, expect, it } from "vitest";
import { shouldFlagMultiBrandReason } from "@/lib/admin/multiBrandReason";

describe("shouldFlagMultiBrandReason", () => {
  it("flags when there are 2+ brand hits and not reviewed", () => {
    expect(shouldFlagMultiBrandReason(2, false)).toBe(true);
    expect(shouldFlagMultiBrandReason(3, false)).toBe(true);
  });

  it("does not flag when multi-brand mentions were reviewed", () => {
    expect(shouldFlagMultiBrandReason(2, true)).toBe(false);
    expect(shouldFlagMultiBrandReason(5, true)).toBe(false);
  });

  it("does not flag when fewer than 2 brand hits", () => {
    expect(shouldFlagMultiBrandReason(0, false)).toBe(false);
    expect(shouldFlagMultiBrandReason(1, false)).toBe(false);
  });
});
