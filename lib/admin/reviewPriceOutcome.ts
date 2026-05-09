/**
 * Review-queue / badge helpers for listing price vs listing_label_reviews.price_reviewed.
 */

export function shouldFlagNoPriceReason(
  listingPriceCents: number | null,
  reviewPriceReviewed: boolean,
): boolean {
  return listingPriceCents == null && !reviewPriceReviewed;
}

/** Listing grid: show “Unknown” when reviewer marked price reviewed but export-only unknown (no override cents). */
export function isExportOnlyPriceUnknown(
  reviewPriceReviewed: boolean,
  reviewPriceCents: number | null,
  reviewPriceMinCents: number | null,
  reviewPriceMaxCents: number | null,
): boolean {
  return (
    reviewPriceReviewed &&
    reviewPriceCents == null &&
    reviewPriceMinCents == null &&
    reviewPriceMaxCents == null
  );
}
