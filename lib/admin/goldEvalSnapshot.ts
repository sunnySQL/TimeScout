/**
 * Build gold-eval label snapshot from listing row + optional review row.
 * Matches export.py effective_* semantics: reviewed flag true → review columns,
 * else listing columns. Structural flags is_bundle / is_sold come from listings
 * (bundle review updates listings.is_bundle; sold review does not change listings.is_sold).
 */

export type GoldEvalListingInput = {
  brand: string | null;
  reference: string | null;
  condition: string | null;
  watchType: string | null;
  priceCents: number | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  isBundle: boolean;
  isSold: boolean;
};

export type GoldEvalReviewInput = {
  brand: string | null;
  reference: string | null;
  condition: string | null;
  watchType: string | null;
  priceCents: number | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  brandReviewed: boolean;
  referenceReviewed: boolean;
  conditionReviewed: boolean;
  watchTypeReviewed: boolean;
  priceReviewed: boolean;
};

export type GoldEvalSnapshot = {
  brand: string | null;
  reference: string | null;
  condition: string | null;
  watchType: string | null;
  priceCents: number | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  isBundle: boolean;
  isSold: boolean;
};

function truthyReviewed(v: unknown): boolean {
  return v === true || v === 1;
}

export function computeGoldEvalSnapshot(
  listing: GoldEvalListingInput,
  review: GoldEvalReviewInput | null | undefined,
): GoldEvalSnapshot {
  const r = review;
  return {
    brand: r && truthyReviewed(r.brandReviewed) ? r.brand : listing.brand,
    reference: r && truthyReviewed(r.referenceReviewed) ? r.reference : listing.reference,
    condition: r && truthyReviewed(r.conditionReviewed) ? r.condition : listing.condition,
    watchType: r && truthyReviewed(r.watchTypeReviewed) ? r.watchType : listing.watchType,
    priceCents: r && truthyReviewed(r.priceReviewed) ? r.priceCents : listing.priceCents,
    priceMinCents: r && truthyReviewed(r.priceReviewed) ? r.priceMinCents : listing.priceMinCents,
    priceMaxCents: r && truthyReviewed(r.priceReviewed) ? r.priceMaxCents : listing.priceMaxCents,
    isBundle: listing.isBundle,
    isSold: listing.isSold,
  };
}

/** Prefer explicit client notes; otherwise persisted review notes. */
export function resolveGoldEvalNotes(
  notesFromClient: string | null | undefined,
  reviewNotes: string | null | undefined,
): string | null {
  const trimmedClient = notesFromClient?.trim();
  if (trimmedClient) return trimmedClient;
  const trimmedReview = reviewNotes?.trim();
  return trimmedReview ? trimmedReview : null;
}
