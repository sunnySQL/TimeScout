import { describe, expect, it } from "vitest";
import {
  goldEvalPricesAreBlank,
  parseGoldEvalJoinRow,
  triBool,
} from "@/lib/admin/goldEvalJoinSnapshot";

describe("parseGoldEvalJoinRow", () => {
  it("maps gold columns with normalized prices and booleans", () => {
    const snap = parseGoldEvalJoinRow({
      goldBrand: "Rolex",
      goldReference: null,
      goldCondition: "good",
      goldWatchType: "vintage",
      goldPriceCents: 10000n,
      goldPriceMinCents: null,
      goldPriceMaxCents: null,
      goldIsBundle: 0,
      goldIsSold: 1,
      goldNotes: " hi ",
    });
    expect(snap.brand).toBe("Rolex");
    expect(snap.reference).toBe(null);
    expect(snap.priceCents).toBe(10000);
    expect(snap.isBundle).toBe(false);
    expect(snap.isSold).toBe(true);
    expect(snap.notes).toBe(" hi ");
  });
});

describe("goldEvalPricesAreBlank", () => {
  it("is true only when all price fields are null", () => {
    expect(
      goldEvalPricesAreBlank({
        brand: null,
        reference: null,
        condition: null,
        watchType: null,
        priceCents: null,
        priceMinCents: null,
        priceMaxCents: null,
        isBundle: null,
        isSold: null,
        notes: null,
      }),
    ).toBe(true);
    expect(
      goldEvalPricesAreBlank({
        brand: null,
        reference: null,
        condition: null,
        watchType: null,
        priceCents: 1,
        priceMinCents: null,
        priceMaxCents: null,
        isBundle: null,
        isSold: null,
        notes: null,
      }),
    ).toBe(false);
  });
});

describe("triBool", () => {
  it("returns null for unset", () => {
    expect(triBool(null)).toBe(null);
    expect(triBool(undefined)).toBe(null);
  });
});
