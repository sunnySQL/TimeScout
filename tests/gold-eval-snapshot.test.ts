import { describe, expect, it } from "vitest";
import {
  computeGoldEvalSnapshot,
  resolveGoldEvalNotes,
} from "@/lib/admin/goldEvalSnapshot";

const listing = {
  brand: "Rolex",
  reference: "126610",
  condition: "excellent",
  watchType: null as string | null,
  priceCents: 10_000,
  priceMinCents: null as number | null,
  priceMaxCents: null as number | null,
  isBundle: false,
  isSold: true,
};

describe("computeGoldEvalSnapshot", () => {
  it("prefers reviewed fields when flags are true", () => {
    const snap = computeGoldEvalSnapshot(listing, {
      brand: "Omega",
      reference: null,
      condition: "good",
      watchType: "vintage",
      priceCents: 20_000,
      priceMinCents: null,
      priceMaxCents: null,
      brandReviewed: true,
      referenceReviewed: false,
      conditionReviewed: true,
      watchTypeReviewed: true,
      priceReviewed: true,
    });
    expect(snap.brand).toBe("Omega");
    expect(snap.reference).toBe("126610");
    expect(snap.condition).toBe("good");
    expect(snap.watchType).toBe("vintage");
    expect(snap.priceCents).toBe(20_000);
    expect(snap.isBundle).toBe(false);
    expect(snap.isSold).toBe(true);
  });

  it("uses listing columns when review missing", () => {
    const snap = computeGoldEvalSnapshot(listing, null);
    expect(snap.brand).toBe("Rolex");
    expect(snap.reference).toBe("126610");
    expect(snap.condition).toBe("excellent");
    expect(snap.watchType).toBe(null);
    expect(snap.priceCents).toBe(10_000);
  });
});

describe("resolveGoldEvalNotes", () => {
  it("prefers non-empty client notes", () => {
    expect(resolveGoldEvalNotes("  hello ", null)).toBe("hello");
    expect(resolveGoldEvalNotes("x", "review")).toBe("x");
  });

  it("falls back to review notes", () => {
    expect(resolveGoldEvalNotes(undefined, " kept ")).toBe("kept");
    expect(resolveGoldEvalNotes("", "review")).toBe("review");
    expect(resolveGoldEvalNotes(null, null)).toBe(null);
  });
});
