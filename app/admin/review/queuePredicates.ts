import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { listingLabelReviews, listings } from "@/db/schema";

function requireSql(condition: SQL | undefined): SQL {
  if (!condition) throw new Error("Expected a review queue SQL predicate.");
  return condition;
}

/**
 * Missing-brand queue: no canonical listing brand unless a reviewer explicitly
 * resolved it (including “brand unknown”).
 */
export const missingBrandUnresolvedSql = requireSql(
  and(
    isNull(listings.brand),
    sql`${listingLabelReviews.brandReviewed} IS NOT TRUE`,
  ),
);

/**
 * Missing-price queue: no listing price unless a reviewer explicitly resolved it
 * (including “price unknown” via price_reviewed + null review price columns).
 */
export const missingPriceUnresolvedSql = requireSql(
  and(
    isNull(listings.priceCents),
    sql`${listingLabelReviews.priceReviewed} IS NOT TRUE`,
  ),
);

/** Condition queue: missing listing label unless review resolved it (incl. unknown). */
export const reviewConditionUnresolvedSql = requireSql(
  and(
    isNull(listings.condition),
    sql`${listingLabelReviews.conditionReviewed} IS NOT TRUE`,
  ),
);

/** Sold queue: flagged sold unless reviewer acknowledged. */
export const reviewSoldUnresolvedSql = requireSql(
  and(
    eq(listings.isSold, true),
    sql`${listingLabelReviews.soldReviewed} IS NOT TRUE`,
  ),
);

/** Low-local queue: weak classifier confidence unless reviewer cleared. */
export const reviewLowLocalUnresolvedSql = requireSql(
  and(
    isNotNull(listings.localClassifiedAt),
    sql`CAST(${listings.localConfidence} AS DECIMAL(3,2)) > 0`,
    sql`CAST(${listings.localConfidence} AS DECIMAL(3,2)) < 0.65`,
    sql`${listingLabelReviews.localReviewed} IS NOT TRUE`,
  ),
);

/** Bundle queue: auto-flagged bundle unless reviewer locked single vs bundle. */
export const reviewBundleUnresolvedSql = requireSql(
  and(
    eq(listings.isBundle, true),
    sql`${listingLabelReviews.bundleReviewed} IS NOT TRUE`,
  ),
);

/** Any SQL-backed “all flagged” reason (excludes heuristic multi-brand hits). */
export const reviewAllFlaggedOrSql = requireSql(
  or(
    missingBrandUnresolvedSql,
    missingPriceUnresolvedSql,
    reviewConditionUnresolvedSql,
    reviewSoldUnresolvedSql,
    reviewBundleUnresolvedSql,
    reviewLowLocalUnresolvedSql,
  ),
);
