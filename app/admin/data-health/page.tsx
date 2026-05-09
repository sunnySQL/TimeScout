import Link from "next/link";
import type { ReactNode } from "react";
import type { SQL } from "drizzle-orm";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  AdminHeader,
  AdminNav,
  AdminPanel,
  AdminShell,
  AdminStatCard,
  SectionTitle,
  adminBtnSecondaryClass,
} from "@/app/admin/_components";
import { MULTI_BRAND_CANDIDATE_CAP, REVIEW_RECENT_DAYS } from "@/app/admin/review/constants";
import {
  missingBrandUnresolvedSql,
  missingPriceUnresolvedSql,
  reviewAllFlaggedOrSql,
  reviewBundleUnresolvedSql,
  reviewConditionUnresolvedSql,
  reviewLowLocalUnresolvedSql,
  reviewSoldUnresolvedSql,
} from "@/app/admin/review/queuePredicates";
import { shouldFlagMultiBrandReason } from "@/lib/admin/multiBrandReason";
import { getDb } from "@/db";
import { listingLabelReviews, listings } from "@/db/schema";
import { listAllBrandHits, stripTradePreferenceSections } from "@/lib/watches/parse";

export const dynamic = "force-dynamic";

const REVIEW_LIMIT = 60;

function sqlBoolTrue(v: unknown): boolean {
  return v === true || v === 1;
}

function reviewQueueHref(filter: string): string {
  const sp = new URLSearchParams();
  sp.set("filter", filter);
  sp.set("limit", String(REVIEW_LIMIT));
  return `/admin/review?${sp.toString()}`;
}

function ReviewQueueLink({ filter, children }: { filter: string; children: ReactNode }) {
  return (
    <Link href={reviewQueueHref(filter)} className={`${adminBtnSecondaryClass} mt-2 inline-block`}>
      {children}
    </Link>
  );
}

async function countJoined(db: ReturnType<typeof getDb>, where: SQL): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(listings)
    .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
    .where(where);
  return Number(row?.n ?? 0);
}

export default async function AdminDataHealthPage() {
  const db = getDb();
  const since14d = new Date(Date.now() - REVIEW_RECENT_DAYS * 24 * 60 * 60 * 1000);
  const recent = gte(listings.firstSeenAt, since14d);

  const reviewedTodayStart = new Date();
  reviewedTodayStart.setUTCHours(0, 0, 0, 0);

  const refLowConfWhere = and(
    recent,
    isNotNull(listings.reference),
    isNotNull(listings.referenceConfidence),
    sql`CAST(${listings.referenceConfidence} AS DECIMAL(4,3)) < 0.880`,
  );

  const allFlaggedWhereSqlOnly = and(recent, reviewAllFlaggedOrSql);

  const [
    totalListings,
    listingsLast14d,
    manualReviewTotal,
    manualReviewToday,
    soldListings,
    bundleListings,
    flairRangeOnly,
    missingDescription,
    localClassifiedRows,
    aiClassifiedRows,
    cntMissingBrand,
    cntMissingPrice,
    cntMissingCondition,
    cntLowLocal,
    cntBundle,
    cntSold,
    cntRefLow,
    cntAllFlaggedSql,
    multiBrandCandidates,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(listings)
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(listings)
      .where(recent)
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(listingLabelReviews)
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(listingLabelReviews)
      .where(gte(listingLabelReviews.reviewedAt, reviewedTodayStart))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(listings)
      .where(eq(listings.isSold, true))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(listings)
      .where(eq(listings.isBundle, true))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(listings)
      .where(or(isNotNull(listings.priceMinCents), isNotNull(listings.priceMaxCents)))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(listings)
      .where(or(isNull(listings.description), eq(listings.description, "[no comment]")))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(listings)
      .where(isNotNull(listings.localClassifiedAt))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(listings)
      .where(isNotNull(listings.aiClassifiedAt))
      .then((r) => Number(r[0]?.n ?? 0)),
    countJoined(db, and(recent, missingBrandUnresolvedSql) as SQL),
    countJoined(db, and(recent, missingPriceUnresolvedSql) as SQL),
    countJoined(db, and(recent, reviewConditionUnresolvedSql) as SQL),
    countJoined(db, and(recent, reviewLowLocalUnresolvedSql) as SQL),
    countJoined(db, and(recent, reviewBundleUnresolvedSql) as SQL),
    countJoined(db, and(recent, reviewSoldUnresolvedSql) as SQL),
    countJoined(db, refLowConfWhere as SQL),
    countJoined(db, allFlaggedWhereSqlOnly as SQL),
    db
      .select({
        id: listings.id,
        title: listings.title,
        description: listings.description,
        multiBrandReviewed: listingLabelReviews.multiBrandReviewed,
      })
      .from(listings)
      .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
      .where(recent)
      .orderBy(desc(listings.firstSeenAt))
      .limit(MULTI_BRAND_CANDIDATE_CAP),
  ]);

  let multiBrandCount = 0;
  let multiBrandReviewedWithHitsCount = 0;
  for (const row of multiBrandCandidates) {
    const text = stripTradePreferenceSections(
      [row.title, row.description].filter(Boolean).join("\n\n"),
    );
    const hits = listAllBrandHits(text).size;
    if (hits < 2) continue;
    if (sqlBoolTrue(row.multiBrandReviewed)) multiBrandReviewedWithHitsCount += 1;
    else multiBrandCount += 1;
  }

  let supplementalAllFlagged = 0;
  const candIds = multiBrandCandidates.map((r) => r.id);
  if (candIds.length > 0) {
    const overlapRows = await db
      .select({ id: listings.id })
      .from(listings)
      .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
      .where(and(allFlaggedWhereSqlOnly, inArray(listings.id, candIds)));
    const overlapSet = new Set(overlapRows.map((r) => r.id));

    for (const row of multiBrandCandidates) {
      if (overlapSet.has(row.id)) continue;
      const text = stripTradePreferenceSections(
        [row.title, row.description].filter(Boolean).join("\n\n"),
      );
      const hits = listAllBrandHits(text).size;
      if (shouldFlagMultiBrandReason(hits, sqlBoolTrue(row.multiBrandReviewed))) {
        supplementalAllFlagged += 1;
      }
    }
  }

  const cntAllFlagged = cntAllFlaggedSql + supplementalAllFlagged;
  const multiBrandCapReached = multiBrandCandidates.length >= MULTI_BRAND_CANDIDATE_CAP;

  return (
    <AdminShell>
      <AdminHeader title="Data health" />
      <AdminNav active="dataHealth" />

      <p className="mb-6 text-sm text-stone-600 dark:text-stone-400">
        Read-only snapshot of listing and review-queue metrics. Nothing on this page writes to the database.
      </p>

      <SectionTitle>Summary</SectionTitle>
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminStatCard label="Total listings" value={totalListings.toLocaleString()} />
        <AdminStatCard
          label={`Listings seen (last ${REVIEW_RECENT_DAYS} days)`}
          value={listingsLast14d.toLocaleString()}
          detail={`first_seen_at ≥ ${since14d.toISOString().slice(0, 10)} (UTC window)`}
        />
        <AdminStatCard
          label="Manual review rows"
          value={manualReviewTotal.toLocaleString()}
          detail="Rows in listing_label_reviews"
        />
        <AdminStatCard
          label="Reviews logged today (UTC)"
          value={manualReviewToday.toLocaleString()}
          detail={`reviewed_at ≥ ${reviewedTodayStart.toISOString().slice(0, 10)}`}
        />
        <AdminStatCard label="Sold listings" value={soldListings.toLocaleString()} detail="listings.is_sold" />
        <AdminStatCard label="Bundle listings" value={bundleListings.toLocaleString()} detail="listings.is_bundle" />
      </div>

      <SectionTitle>Needs attention (review queue)</SectionTitle>
      <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
        Same 14-day window and SQL rules as the{" "}
        <Link href="/admin/review" className="underline">
          review queue
        </Link>
        . Each card links to the matching filter.
      </p>
      <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AdminStatCard
          label="Missing brand"
          value={cntMissingBrand.toLocaleString()}
          detail={<ReviewQueueLink filter="missing-brand">Open queue →</ReviewQueueLink>}
        />
        <AdminStatCard
          label="Missing price"
          value={cntMissingPrice.toLocaleString()}
          detail={<ReviewQueueLink filter="missing-price">Open queue →</ReviewQueueLink>}
        />
        <AdminStatCard
          label="Missing condition (unresolved)"
          value={cntMissingCondition.toLocaleString()}
          detail={<ReviewQueueLink filter="missing-condition">Open queue →</ReviewQueueLink>}
        />
        <AdminStatCard
          label="Low local confidence (unresolved)"
          value={cntLowLocal.toLocaleString()}
          detail={<ReviewQueueLink filter="low-local">Open queue →</ReviewQueueLink>}
        />
        <AdminStatCard
          label="Possible bundle (unresolved)"
          value={cntBundle.toLocaleString()}
          detail={<ReviewQueueLink filter="bundle">Open queue →</ReviewQueueLink>}
        />
        <AdminStatCard
          label="Sold (unresolved)"
          value={cntSold.toLocaleString()}
          detail={<ReviewQueueLink filter="sold">Open queue →</ReviewQueueLink>}
        />
        <AdminStatCard
          label="Reference present, low confidence"
          value={cntRefLow.toLocaleString()}
          detail={<ReviewQueueLink filter="ref-low-conf">Open queue →</ReviewQueueLink>}
        />
        <AdminStatCard
          label="Multi-brand mentions (scan)"
          value={multiBrandCount.toLocaleString()}
          detail={
            <>
              <ReviewQueueLink filter="multi-brand">Open queue →</ReviewQueueLink>
              <span className="mt-2 block text-[10px] text-stone-500 dark:text-stone-400">
                Reviewed as harmless (2+ hits, scan window):{" "}
                {multiBrandReviewedWithHitsCount.toLocaleString()}
              </span>
              {multiBrandCapReached ? (
                <span className="mt-2 block text-amber-700 dark:text-amber-400">
                  Scan capped at {MULTI_BRAND_CANDIDATE_CAP} newest listings in the {REVIEW_RECENT_DAYS}-day window;
                  true total may be higher.
                </span>
              ) : null}
            </>
          }
        />
        <AdminStatCard
          label="All flagged"
          value={cntAllFlagged.toLocaleString()}
          detail={<ReviewQueueLink filter="all">Open queue →</ReviewQueueLink>}
        />
      </div>

      <SectionTitle>Data quality</SectionTitle>
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminStatCard
          label="Flair / range price bounds set"
          value={flairRangeOnly.toLocaleString()}
          detail="price_min_cents or price_max_cents is set"
        />
        <AdminStatCard
          label="Missing description"
          value={missingDescription.toLocaleString()}
          detail='description IS NULL or equals "[no comment]"'
        />
        <AdminStatCard
          label="Local classified rows"
          value={localClassifiedRows.toLocaleString()}
          detail="local_classified_at IS NOT NULL"
        />
        <AdminStatCard
          label="AI classified rows"
          value={aiClassifiedRows.toLocaleString()}
          detail="ai_classified_at IS NOT NULL"
        />
      </div>

      <AdminPanel>
        <SectionTitle className="mb-3">Related</SectionTitle>
        <ul className="space-y-2 text-sm text-stone-600 dark:text-stone-300">
          <li>
            <Link href="/admin/review" className="font-medium text-stone-800 underline dark:text-stone-100">
              Review queue
            </Link>{" "}
            — edit listings and label reviews
          </li>
          <li>
            <Link href="/admin/ai" className="font-medium text-stone-800 underline dark:text-stone-100">
              Classifier
            </Link>{" "}
            — model coverage and samples
          </li>
        </ul>
      </AdminPanel>
    </AdminShell>
  );
}
