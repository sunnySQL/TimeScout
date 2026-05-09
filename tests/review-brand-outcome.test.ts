import { describe, expect, it } from "vitest";
import {
  brandReviewOutcomeFromForm,
  brandReviewOutcomeKey,
} from "@/lib/admin/reviewBrandOutcome";

describe("brandReviewOutcomeFromForm", () => {
  it("treats non-empty text as value outcome regardless of unknown checkbox", () => {
    expect(brandReviewOutcomeFromForm("Rolex", false)).toBe("value");
    expect(brandReviewOutcomeFromForm("Rolex", true)).toBe("value");
  });

  it("treats empty text + unknown as unknown outcome", () => {
    expect(brandReviewOutcomeFromForm("", true)).toBe("unknown");
  });

  it("treats empty text without unknown as unset", () => {
    expect(brandReviewOutcomeFromForm("", false)).toBe("unset");
  });
});

describe("brandReviewOutcomeKey", () => {
  it("stabilizes value outcomes for equality checks", () => {
    expect(brandReviewOutcomeKey("value", "A")).toBe("value:A");
    expect(brandReviewOutcomeKey("unknown")).toBe("unknown");
    expect(brandReviewOutcomeKey("unset")).toBe("unset");
  });
});
