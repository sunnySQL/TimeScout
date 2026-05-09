/** Columns selected alongside `baseSelect` for `/admin/review?filter=gold-eval`. */

export type GoldEvalJoinRow = {
  goldBrand: string | null;
  goldReference: string | null;
  goldCondition: string | null;
  goldWatchType: string | null;
  goldPriceCents: unknown;
  goldPriceMinCents: unknown;
  goldPriceMaxCents: unknown;
  goldIsBundle: unknown;
  goldIsSold: unknown;
  goldNotes: string | null;
};

/** Frozen labels stored in `listing_gold_eval` (normalized for UI). */
export type GoldEvalTableSnapshot = {
  brand: string | null;
  reference: string | null;
  condition: string | null;
  watchType: string | null;
  priceCents: number | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  isBundle: boolean | null;
  isSold: boolean | null;
  notes: string | null;
};

export function numOrNullGold(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** MySQL nullable tinyint / driver quirks → tri-state */
export function triBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  return null;
}

export function parseGoldEvalJoinRow(row: GoldEvalJoinRow): GoldEvalTableSnapshot {
  return {
    brand: row.goldBrand,
    reference: row.goldReference,
    condition: row.goldCondition,
    watchType: row.goldWatchType,
    priceCents: numOrNullGold(row.goldPriceCents),
    priceMinCents: numOrNullGold(row.goldPriceMinCents),
    priceMaxCents: numOrNullGold(row.goldPriceMaxCents),
    isBundle: triBool(row.goldIsBundle),
    isSold: triBool(row.goldIsSold),
    notes: row.goldNotes,
  };
}

export function goldEvalPricesAreBlank(snapshot: GoldEvalTableSnapshot): boolean {
  return (
    snapshot.priceCents == null &&
    snapshot.priceMinCents == null &&
    snapshot.priceMaxCents == null
  );
}
