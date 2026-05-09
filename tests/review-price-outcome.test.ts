import { describe, expect, it } from "vitest";
import {
  isExportOnlyPriceUnknown,
  shouldFlagNoPriceReason,
} from "@/lib/admin/reviewPriceOutcome";

describe("shouldFlagNoPriceReason", () => {
  it("flags when listing has no price and review has not acknowledged", () => {
    expect(shouldFlagNoPriceReason(null, false)).toBe(true);
  });

  it("does not flag when price_reviewed true (unknown or otherwise resolved)", () => {
    expect(shouldFlagNoPriceReason(null, true)).toBe(false);
  });

  it("does not flag when listing has a price", () => {
    expect(shouldFlagNoPriceReason(99_00, false)).toBe(false);
    expect(shouldFlagNoPriceReason(99_00, true)).toBe(false);
  });
});

describe("isExportOnlyPriceUnknown", () => {
  it("is true when reviewed with all review price columns null", () => {
    expect(isExportOnlyPriceUnknown(true, null, null, null)).toBe(true);
  });

  it("is false when not reviewed", () => {
    expect(isExportOnlyPriceUnknown(false, null, null, null)).toBe(false);
  });

  it("is false when review row holds a concrete override", () => {
    expect(isExportOnlyPriceUnknown(true, 100_00, null, null)).toBe(false);
    expect(isExportOnlyPriceUnknown(true, null, 50_00, 150_00)).toBe(false);
  });
});
