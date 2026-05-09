import { describe, expect, it } from "vitest";
import {
  escapeMysqlLikePattern,
  reviewGoldEvalTabSearchWhere,
  reviewListingsSearchWhere,
  trimReviewSearchInput,
} from "@/lib/admin/reviewListingSearch";

describe("trimReviewSearchInput", () => {
  it("trims and handles array param", () => {
    expect(trimReviewSearchInput("  rolex  ")).toBe("rolex");
    expect(trimReviewSearchInput([" x "])).toBe("x");
    expect(trimReviewSearchInput(undefined)).toBe("");
  });
});

describe("escapeMysqlLikePattern", () => {
  it("escapes LIKE metacharacters", () => {
    expect(escapeMysqlLikePattern("100%")).toBe("100\\%");
    expect(escapeMysqlLikePattern("a_b")).toBe("a\\_b");
    expect(escapeMysqlLikePattern(`path\\file`)).toBe("path\\\\file");
  });
});

describe("reviewGoldEvalTabSearchWhere", () => {
  it("returns SQL when query non-empty", () => {
    expect(reviewListingsSearchWhere("")).toBeUndefined();
    expect(reviewGoldEvalTabSearchWhere("")).toBeUndefined();
    expect(reviewGoldEvalTabSearchWhere("rolex")).toBeDefined();
    expect(reviewGoldEvalTabSearchWhere("  x  ")).toBeDefined();
  });
});
