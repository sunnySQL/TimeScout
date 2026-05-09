import Link from "next/link";
import { and, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  AdminEmptyState,
  AdminHeader,
  AdminNav,
  AdminShell,
  AdminTable,
  adminBtnMutedClass,
  adminBtnSecondaryClass,
  adminTdClass,
  adminThClass,
  adminTheadRowClass,
  adminTbodyRowClass,
} from "@/app/admin/_components";
import { getDb } from "@/db";
import { listingGoldEval, listingLabelReviews, listings, sources } from "@/db/schema";
import { isExportOnlyPriceUnknown, shouldFlagNoPriceReason } from "@/lib/admin/reviewPriceOutcome";
import {
  goldEvalPricesAreBlank,
  parseGoldEvalJoinRow,
  type GoldEvalJoinRow,
  type GoldEvalTableSnapshot,
} from "@/lib/admin/goldEvalJoinSnapshot";
import {
  andReviewSearch,
  reviewGoldEvalTabSearchWhere,
  reviewListingsSearchWhere,
  sqlTrue,
  trimReviewSearchInput,
} from "@/lib/admin/reviewListingSearch";
import { buildReviewSearchQuery, REVIEW_DEFAULT_LIMIT } from "@/lib/admin/reviewSearchUrl";
import { shouldFlagMultiBrandReason } from "@/lib/admin/multiBrandReason";
import { timeAgo, formatUsd } from "@/lib/format";
import { listAllBrandHits, stripTradePreferenceSections } from "@/lib/watches/parse";
import { MULTI_BRAND_CANDIDATE_CAP, REVIEW_RECENT_DAYS } from "./constants";
import {
  missingBrandUnresolvedSql,
  missingPriceUnresolvedSql,
  reviewAllFlaggedOrSql,
  reviewBundleUnresolvedSql,
  reviewConditionUnresolvedSql,
  reviewLowLocalUnresolvedSql,
  reviewSoldUnresolvedSql,
} from "./queuePredicates";
import { ReviewLiveSearch } from "./ReviewLiveSearch";
import { ReviewLimitForm } from "./ReviewLimitForm";
import { ReviewRow } from "./ReviewRow";
import { ReviewSessionCounter } from "./ReviewSessionCounter";

export const dynamic = "force-dynamic";

type Filter =
  | "missing-brand"
  | "missing-price"
  | "missing-condition"
  | "low-local"
  | "bundle"
  | "sold"
  | "multi-brand"
  | "ref-low-conf"
  | "reviewed"
  | "gold-eval"
  | "all";

const VALID_FILTERS = new Set<Filter>([
  "missing-brand",
  "missing-price",
  "missing-condition",
  "low-local",
  "bundle",
  "sold",
  "multi-brand",
  "ref-low-conf",
  "reviewed",
  "gold-eval",
  "all",
]);

const FILTER_LABELS: Record<Filter, string> = {
  "missing-brand": "Missing brand",
  "missing-price": "Missing price",
  "missing-condition": "Missing condition",
  "low-local": "Low confidence (local)",
  bundle: "Possible bundle",
  sold: "Sold detected",
  "multi-brand": "Multi brand mentions",
  "ref-low-conf": "Ref present, low conf",
  reviewed: "Reviewed past cases",
  "gold-eval": "Gold eval",
  all: "All flagged",
};

/** Queue tabs (first row — operational queues). */
const QUEUE_FILTERS: readonly Filter[] = [
  "missing-brand",
  "missing-price",
  "missing-condition",
  "low-local",
  "bundle",
  "sold",
  "multi-brand",
  "ref-low-conf",
  "all",
];

/** Saved / history tabs (second row — persisted review states). */
const SAVED_FILTERS: readonly Filter[] = ["reviewed", "gold-eval"];

/** Toolbar control cards — shared shell so Search / Session / Rows align. */
const REVIEW_TOOLBAR_CARD =
  "flex h-full min-h-[5.25rem] flex-col rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-700 dark:bg-stone-900/40";
const REVIEW_TOOLBAR_CARD_LABEL =
  "mb-1.5 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-300";

const MAX_LIMIT = 200;

function requireSql(condition: SQL | undefined): SQL {
  if (!condition) throw new Error("Expected a review queue SQL predicate.");
  return condition;
}

function parseLimit(raw: string | string[] | undefined): number {
  const s = firstQueryString(raw, String(REVIEW_DEFAULT_LIMIT));
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n)) return REVIEW_DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, n));
}

function parsePage(raw: string | string[] | undefined): number {
  const s = firstQueryString(raw, "1");
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/** RSC → client: mysql bigint / string amounts must not be BigInt (serialization error). */
function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Driver may surface MySQL booleans as 0/1 or actual booleans */
function sqlBoolTrue(v: unknown): boolean {
  return v === true || v === 1;
}

function firstQueryString(raw: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(raw)) return raw[0] ?? fallback;
  return typeof raw === "string" ? raw : fallback;
}

function listingMultiBrandHitCount(title: string | null, description: string | null): number {
  const text = stripTradePreferenceSections(
    [title, description].filter(Boolean).join("\n\n"),
  );
  return listAllBrandHits(text).size;
}

type ListingReviewSelect = {
  id: number;
  title: string | null;
  description: string | null;
  brand: string | null;
  reference: string | null;
  priceCents: unknown;
  priceMinCents: unknown;
  priceMaxCents: unknown;
  condition: string | null;
  watchType: string | null;
  classifierSource: string | null;
  localClassifiedAt: Date | null;
  localConfidence: string | null;
  aiConfidence: string | null;
  brandSource: string | null;
  brandConfidence: string | null;
  referenceSource: string | null;
  referenceConfidence: string | null;
  conditionSource: string | null;
  conditionConfidence: string | null;
  watchTypeSource: string | null;
  watchTypeConfidence: string | null;
  isBundle: boolean;
  isSold: boolean;
  listingUrl: string;
  firstSeenAt: Date | null;
  sourceName: string | null;
  reviewNotes: string | null;
  reviewSoldReviewed: unknown;
  reviewLocalReviewed: unknown;
  reviewBundleReviewed: unknown;
  reviewConditionReviewed: unknown;
  reviewPriceReviewed: unknown;
  reviewPriceCents: unknown;
  reviewPriceMinCents: unknown;
  reviewPriceMaxCents: unknown;
  reviewBrandReviewed: unknown;
  reviewMultiBrandReviewed: unknown;
  goldEvalListingId: number | null;
};

type EnrichedListingReviewRow = ListingReviewSelect & {
  reasons: string[];
  rowIsLowLocal: boolean;
  /** Row exists in `listing_gold_eval` (left join present). */
  isInGoldEval: boolean;
  /** Present only on `gold-eval` tab — frozen labels from `listing_gold_eval`. */
  goldSnapshot?: GoldEvalTableSnapshot;
};

function enrichListingReviewRow(r: ListingReviewSelect): EnrichedListingReviewRow {
  const reasons: string[] = [];
  const confLocal = Number(r.localConfidence ?? 0);
  const rowIsLowLocal =
    r.localClassifiedAt != null && confLocal > 0 && confLocal < 0.65;

  if (!r.brand && !sqlBoolTrue(r.reviewBrandReviewed)) reasons.push("no-brand");
  if (
    shouldFlagNoPriceReason(numOrNull(r.priceCents), sqlBoolTrue(r.reviewPriceReviewed))
  ) {
    reasons.push("no-price");
  }
  if (!r.condition && !sqlBoolTrue(r.reviewConditionReviewed)) {
    reasons.push("no-condition");
  }
  if (r.isBundle && !sqlBoolTrue(r.reviewBundleReviewed)) reasons.push("bundle");
  if (r.isSold && !sqlBoolTrue(r.reviewSoldReviewed)) reasons.push("sold");

  if (rowIsLowLocal && !sqlBoolTrue(r.reviewLocalReviewed)) {
    reasons.push("low-local");
  }

  const confRef = Number(r.referenceConfidence ?? 0);
  if (r.reference && confRef > 0 && confRef < 0.88) reasons.push("ref-low-conf");

  const text = stripTradePreferenceSections(
    [r.title, r.description].filter(Boolean).join("\n\n"),
  );
  const brandHits = listAllBrandHits(text);
  if (
    shouldFlagMultiBrandReason(brandHits.size, sqlBoolTrue(r.reviewMultiBrandReviewed))
  ) {
    reasons.push("multi-brand");
  }

  return {
    ...r,
    reasons,
    rowIsLowLocal,
    isInGoldEval: r.goldEvalListingId != null,
  };
}

export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.filter === "string" ? params.filter : "all";
  const filter: Filter = VALID_FILTERS.has(raw as Filter) ? (raw as Filter) : "all";
  const limit = parseLimit(params.limit);
  const page = parsePage(params.page);
  const searchQ = trimReviewSearchInput(params.q);
  const searchSql =
    filter === "gold-eval"
      ? reviewGoldEvalTabSearchWhere(searchQ)
      : reviewListingsSearchWhere(searchQ);

  const db = getDb();

  const sinceRecent = new Date(Date.now() - REVIEW_RECENT_DAYS * 24 * 60 * 60 * 1000);

  const refLowConfWhere = and(
    gte(listings.firstSeenAt, sinceRecent),
    isNotNull(listings.reference),
    isNotNull(listings.referenceConfidence),
    sql`CAST(${listings.referenceConfidence} AS DECIMAL(4,3)) < 0.880`,
  );

  const [refLowCountRow] = await db
    .select({ n: count() })
    .from(listings)
    .where(refLowConfWhere);
  const refLowConfCount = Number(refLowCountRow?.n ?? 0);

  const baseSelect = {
    id: listings.id,
    title: listings.title,
    description: listings.description,
    brand: listings.brand,
    reference: listings.reference,
    priceCents: listings.priceCents,
    priceMinCents: listings.priceMinCents,
    priceMaxCents: listings.priceMaxCents,
    condition: listings.condition,
    watchType: listings.watchType,
    classifierSource: listings.classifierSource,
    localClassifiedAt: listings.localClassifiedAt,
    localConfidence: listings.localConfidence,
    aiConfidence: listings.aiConfidence,
    brandSource: listings.brandSource,
    brandConfidence: listings.brandConfidence,
    referenceSource: listings.referenceSource,
    referenceConfidence: listings.referenceConfidence,
    conditionSource: listings.conditionSource,
    conditionConfidence: listings.conditionConfidence,
    watchTypeSource: listings.watchTypeSource,
    watchTypeConfidence: listings.watchTypeConfidence,
    isBundle: listings.isBundle,
    isSold: listings.isSold,
    listingUrl: listings.listingUrl,
    firstSeenAt: listings.firstSeenAt,
    sourceName: sources.name,
    reviewNotes: listingLabelReviews.notes,
    reviewSoldReviewed: listingLabelReviews.soldReviewed,
    reviewLocalReviewed: listingLabelReviews.localReviewed,
    reviewBundleReviewed: listingLabelReviews.bundleReviewed,
    reviewConditionReviewed: listingLabelReviews.conditionReviewed,
    reviewPriceReviewed: listingLabelReviews.priceReviewed,
    reviewPriceCents: listingLabelReviews.priceCents,
    reviewPriceMinCents: listingLabelReviews.priceMinCents,
    reviewPriceMaxCents: listingLabelReviews.priceMaxCents,
  reviewBrandReviewed: listingLabelReviews.brandReviewed,
  reviewMultiBrandReviewed: listingLabelReviews.multiBrandReviewed,
  goldEvalListingId: listingGoldEval.listingId,
};

  const goldEvalSelect = {
    ...baseSelect,
    goldBrand: listingGoldEval.brand,
    goldReference: listingGoldEval.reference,
    goldCondition: listingGoldEval.condition,
    goldWatchType: listingGoldEval.watchType,
    goldPriceCents: listingGoldEval.priceCents,
    goldPriceMinCents: listingGoldEval.priceMinCents,
    goldPriceMaxCents: listingGoldEval.priceMaxCents,
    goldIsBundle: listingGoldEval.isBundle,
    goldIsSold: listingGoldEval.isSold,
    goldNotes: listingGoldEval.notes,
  };

  function buildQueueSqlWhere(f: Exclude<Filter, "multi-brand" | "all" | "reviewed" | "gold-eval">): SQL {
    const recent = gte(listings.firstSeenAt, sinceRecent);
    switch (f) {
      case "missing-brand":
        return requireSql(and(recent, missingBrandUnresolvedSql));
      case "missing-price":
        return requireSql(and(recent, missingPriceUnresolvedSql));
      case "missing-condition":
        return requireSql(and(recent, reviewConditionUnresolvedSql));
      case "low-local":
        return requireSql(and(recent, reviewLowLocalUnresolvedSql));
      case "bundle":
        return requireSql(and(recent, reviewBundleUnresolvedSql));
      case "sold":
        return requireSql(and(recent, reviewSoldUnresolvedSql));
      case "ref-low-conf":
        return requireSql(
          and(
            recent,
            isNotNull(listings.reference),
            isNotNull(listings.referenceConfidence),
            sql`CAST(${listings.referenceConfidence} AS DECIMAL(4,3)) < 0.880`,
          ),
        );
      default: {
        const _never: never = f;
        return _never;
      }
    }
  }

  let total: number;
  let totalPages: number;
  let effectivePage: number;
  let display: EnrichedListingReviewRow[];
  let multiBrandCandidateCapReached = false;

  if (filter === "multi-brand") {
    const recentListingsWhere = andReviewSearch(gte(listings.firstSeenAt, sinceRecent), searchSql);

    const candidates = await db
      .select(baseSelect)
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
      .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
      .where(recentListingsWhere)
      .orderBy(desc(listings.firstSeenAt))
      .limit(MULTI_BRAND_CANDIDATE_CAP);

    multiBrandCandidateCapReached = candidates.length >= MULTI_BRAND_CANDIDATE_CAP;

    const multiBrandRows = candidates
      .map((r) => enrichListingReviewRow(r as ListingReviewSelect))
      .filter((r) => r.reasons.includes("multi-brand"));

    total = multiBrandRows.length;
    totalPages = Math.max(1, Math.ceil(total / limit));
    effectivePage = Math.min(Math.max(1, page), totalPages);
    const sliceStart = (effectivePage - 1) * limit;
    display = multiBrandRows.slice(sliceStart, sliceStart + limit);
  } else if (filter === "reviewed") {
    const reviewedWhere = andReviewSearch(gte(listingLabelReviews.reviewedAt, sinceRecent), searchSql);

    const [countRow] = await db
      .select({ n: count() })
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
      .innerJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
      .where(reviewedWhere);
    total = Number(countRow?.n ?? 0);
    totalPages = Math.max(1, Math.ceil(total / limit));
    effectivePage = Math.min(Math.max(1, page), totalPages);
    const offset = (effectivePage - 1) * limit;

    const rows = await db
      .select(baseSelect)
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
      .innerJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
      .where(reviewedWhere)
      .orderBy(desc(listingLabelReviews.reviewedAt))
      .limit(limit)
      .offset(offset);

    display = rows.map((r) => enrichListingReviewRow(r as ListingReviewSelect));
  } else if (filter === "gold-eval") {
    const goldEvalWhere = andReviewSearch(sqlTrue(), searchSql);

    const [countRow] = await db
      .select({ n: count() })
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .innerJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
      .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
      .where(goldEvalWhere);
    total = Number(countRow?.n ?? 0);
    totalPages = Math.max(1, Math.ceil(total / limit));
    effectivePage = Math.min(Math.max(1, page), totalPages);
    const offset = (effectivePage - 1) * limit;

    const rows = await db
      .select(goldEvalSelect)
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .innerJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
      .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
      .where(goldEvalWhere)
      .orderBy(desc(listingGoldEval.updatedAt))
      .limit(limit)
      .offset(offset);

    display = rows.map((raw) => {
      const row = raw as ListingReviewSelect & GoldEvalJoinRow;
      const enriched = enrichListingReviewRow(row);
      const goldSnapshot = parseGoldEvalJoinRow(row);
      return { ...enriched, reasons: [], goldSnapshot };
    });
  } else if (filter === "all") {
    const recent = gte(listings.firstSeenAt, sinceRecent);
    const sqlAllFlaggedWhere = andReviewSearch(and(recent, reviewAllFlaggedOrSql)!, searchSql);

    const sqlSlim = await db
      .select({ id: listings.id, firstSeenAt: listings.firstSeenAt })
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
      .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
      .where(sqlAllFlaggedWhere)
      .orderBy(desc(listings.firstSeenAt));

    const sqlIdSet = new Set(sqlSlim.map((r) => r.id));

    const candidatesWhere = andReviewSearch(recent, searchSql);

    const candidates = await db
      .select(baseSelect)
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
      .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
      .where(candidatesWhere)
      .orderBy(desc(listings.firstSeenAt))
      .limit(MULTI_BRAND_CANDIDATE_CAP);

    const supplementalSlim: { id: number; firstSeenAt: Date | null }[] = [];
    for (const row of candidates) {
      if (sqlIdSet.has(row.id)) continue;
      const enriched = enrichListingReviewRow(row as ListingReviewSelect);
      if (!enriched.reasons.includes("multi-brand")) continue;
      supplementalSlim.push({ id: row.id, firstSeenAt: row.firstSeenAt });
    }

    const merged = [...sqlSlim, ...supplementalSlim].sort((a, b) => {
      const ta = a.firstSeenAt?.getTime() ?? 0;
      const tb = b.firstSeenAt?.getTime() ?? 0;
      return tb - ta;
    });

    total = merged.length;
    totalPages = Math.max(1, Math.ceil(total / limit));
    effectivePage = Math.min(Math.max(1, page), totalPages);
    const sliceStart = (effectivePage - 1) * limit;
    const pageSlice = merged.slice(sliceStart, sliceStart + limit);
    const pageIds = pageSlice.map((r) => r.id);

    if (pageIds.length === 0) {
      display = [];
    } else {
      const rows = await db
        .select(baseSelect)
        .from(listings)
        .innerJoin(sources, eq(sources.id, listings.sourceId))
        .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
        .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
        .where(inArray(listings.id, pageIds));

      const order = new Map(pageIds.map((id, i) => [id, i]));
      display = rows
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        .map((r) => enrichListingReviewRow(r as ListingReviewSelect));
    }
  } else {
    const whereClause = buildQueueSqlWhere(filter);
    const finalWhere = andReviewSearch(whereClause, searchSql);

    const [countRow] = await db
      .select({ n: count() })
      .from(listings)
      .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
      .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
      .where(finalWhere);
    total = Number(countRow?.n ?? 0);
    totalPages = Math.max(1, Math.ceil(total / limit));
    effectivePage = Math.min(Math.max(1, page), totalPages);
    const offset = (effectivePage - 1) * limit;

    const rows = await db
      .select(baseSelect)
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
      .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
      .where(finalWhere)
      .orderBy(desc(listings.firstSeenAt))
      .limit(limit)
      .offset(offset);

    display = rows.map((r) => enrichListingReviewRow(r as ListingReviewSelect));
  }

  const rowStart = display.length === 0 ? 0 : (effectivePage - 1) * limit + 1;
  const rowEnd = (effectivePage - 1) * limit + display.length;
  const qp = (overrides: { filter?: Filter; page?: number; limit?: number; q?: string | null }) =>
    buildReviewSearchQuery({
      filter: overrides.filter ?? filter,
      page: overrides.page ?? effectivePage,
      limit: overrides.limit ?? limit,
      q: overrides.q !== undefined ? overrides.q : searchQ,
    });

  const pillTabCls =
    "rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-950";

  const renderReviewTab = (f: Filter) => {
    const refLowEmpty = f === "ref-low-conf" && refLowConfCount === 0;
    const active = f === filter;
    if (refLowEmpty) {
      return (
        <span
          key={f}
          title={`No listings in the last ${REVIEW_RECENT_DAYS} days have reference_confidence below 0.88.`}
          className={`${pillTabCls} cursor-default ${
            active
              ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
              : "bg-stone-50 text-stone-400 opacity-60 dark:bg-stone-900 dark:text-stone-500"
          }`}
        >
          {FILTER_LABELS[f]}
        </span>
      );
    }
    return (
      <Link
        key={f}
        href={`/admin/review?${qp({ filter: f, page: 1 })}`}
        className={`${pillTabCls} ${
          active
            ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
            : "bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
        }`}
      >
        {FILTER_LABELS[f]}
      </Link>
    );
  };

  return (
    <AdminShell>
      <AdminHeader title="Review queue" />
      <AdminNav active="review" />

      {/* Filter tabs — two rows: queues vs saved */}
      <div className="mb-6 flex flex-col gap-5">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Queues
          </p>
          <nav className="flex flex-wrap gap-2">{QUEUE_FILTERS.map(renderReviewTab)}</nav>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Saved
          </p>
          <nav className="flex flex-wrap gap-2">{SAVED_FILTERS.map(renderReviewTab)}</nav>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
          Page {effectivePage} of {totalPages} · rows {rowStart}
          {display.length > 0 ? `–${rowEnd}` : ""} of {total}
        </p>
        {filter === "multi-brand" && multiBrandCandidateCapReached ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            — scan stopped at {MULTI_BRAND_CANDIDATE_CAP} recent listings (newest first); older rows in the window are not scanned.
          </p>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-stretch gap-4">
        <div
          className={`${REVIEW_TOOLBAR_CARD} min-w-[min(100%,24rem)] flex-1 basis-[24rem]`}
        >
          <span className={REVIEW_TOOLBAR_CARD_LABEL}>Search</span>
          <ReviewLiveSearch
            filter={filter}
            limit={limit}
            initialQuery={searchQ}
            placeholder={
              filter === "gold-eval"
                ? "Title, live + gold brand/ref, ID, URL…"
                : "Title, brand, ref, ID, URL…"
            }
          />
        </div>

        <div className={`${REVIEW_TOOLBAR_CARD} w-fit shrink-0`}>
          <span className={REVIEW_TOOLBAR_CARD_LABEL}>Session</span>
          <div className="mt-auto flex flex-wrap items-end gap-2">
            <ReviewSessionCounter />
          </div>
        </div>

        <div className={`${REVIEW_TOOLBAR_CARD} w-fit shrink-0`}>
          <span className={REVIEW_TOOLBAR_CARD_LABEL}>Rows / page</span>
          <div className="mt-auto flex flex-wrap items-end gap-2">
            <ReviewLimitForm filter={filter} currentLimit={limit} searchQuery={searchQ} />
          </div>
        </div>
      </div>

      {display.length === 0 ? (
        <AdminEmptyState>
          {filter === "reviewed" ? (
            <p>
              No rows in <strong>Reviewed past cases</strong> — nothing was saved to{" "}
              <code className="rounded bg-stone-100 px-1 font-mono text-xs dark:bg-stone-800">
                listing_label_reviews
              </code>{" "}
              in the last {REVIEW_RECENT_DAYS} days (ordered by{" "}
              <code className="rounded bg-stone-100 px-1 font-mono text-xs dark:bg-stone-800">
                reviewed_at
              </code>
              ).
            </p>
          ) : filter === "gold-eval" ? (
            <p>
              No rows in <strong>Gold eval</strong> —{" "}
              <code className="rounded bg-stone-100 px-1 font-mono text-xs dark:bg-stone-800">
                listing_gold_eval
              </code>{" "}
              is empty. Use <strong>Save to gold eval</strong> from another tab to add listings.
            </p>
          ) : filter === "ref-low-conf" ? (
            <p>
              No recent listings match this queue: nothing in the last {REVIEW_RECENT_DAYS} days has both a reference and{" "}
              <code className="rounded bg-stone-100 px-1 font-mono text-xs dark:bg-stone-800">
                reference_confidence &lt; 0.88
              </code>
              .
            </p>
          ) : searchQ ? (
            <p>No rows match this filter and search.</p>
          ) : (
            <p>No rows match this filter.</p>
          )}
        </AdminEmptyState>
      ) : (
        <AdminTable>
          <thead className={adminTheadRowClass}>
            <tr>
              <th className={adminThClass}>Flags</th>
              <th className={adminThClass}>Title</th>
              <th className={adminThClass}>Brand</th>
              <th className={adminThClass}>Ref</th>
              <th className={adminThClass}>Cond.</th>
              <th className={adminThClass}>Price</th>
              <th className={adminThClass}>Src</th>
              <th className={adminThClass}>Conf.</th>
              <th className={adminThClass}>Seen</th>
              <th className={adminThClass}>Review</th>
            </tr>
          </thead>
          <tbody>
            {display.map((r) => (
              <tr key={r.id} className={adminTbodyRowClass}>
                <td className={adminTdClass}>
                  <div className="flex flex-wrap gap-1">
                    {filter === "reviewed" && <ReviewedPastBadge />}
                    {r.isInGoldEval && <GoldEvalBadge />}
                    {r.reasons.map((reason) => (
                      <ReasonBadge key={reason} reason={reason} />
                    ))}
                  </div>
                </td>
                <td className={`max-w-[220px] ${adminTdClass}`}>
                    <a
                      href={r.listingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stone-700 hover:underline dark:text-stone-200"
                    >
                      <span className="line-clamp-1">{r.title}</span>
                    </a>
                </td>
                <td className={`${adminTdClass} text-xs`}>
                  {filter === "gold-eval" && r.goldSnapshot ? (
                    <GoldEvalBrandCell snapshot={r.goldSnapshot} />
                  ) : r.brand ? (
                      <FieldCell value={r.brand} source={r.brandSource} confidence={r.brandConfidence} />
                    ) : sqlBoolTrue(r.reviewBrandReviewed) ? (
                      <span className="text-stone-500 dark:text-stone-400">Unknown</span>
                    ) : (
                      <Dash />
                    )}
                  </td>
                <td className={`${adminTdClass} font-mono text-xs`}>
                  {filter === "gold-eval" && r.goldSnapshot ? (
                    <GoldEvalReferenceCell snapshot={r.goldSnapshot} />
                  ) : r.reference ? (
                    <FieldCell value={r.reference} source={r.referenceSource} confidence={r.referenceConfidence} />
                  ) : (
                    <Dash />
                  )}
                </td>
                <td className={`${adminTdClass} text-xs`}>
                  {filter === "gold-eval" && r.goldSnapshot ? (
                    <GoldEvalConditionCell snapshot={r.goldSnapshot} />
                  ) : r.condition ? (
                      <FieldCell value={r.condition} source={r.conditionSource} confidence={r.conditionConfidence} />
                    ) : sqlBoolTrue(r.reviewConditionReviewed) ? (
                      <FieldCell value="Unknown" source="manual" confidence={null} />
                    ) : (
                      <Dash />
                    )}
                  </td>
                <td className={`${adminTdClass} text-xs text-stone-700 dark:text-stone-200`}>
                  {filter === "gold-eval" && r.goldSnapshot ? (
                    <GoldEvalPriceCell snapshot={r.goldSnapshot} />
                  ) : (
                  (() => {
                    const cents = numOrNull(r.priceCents);
                    if (cents != null) return formatUsd(cents);
                    if (
                      isExportOnlyPriceUnknown(
                        sqlBoolTrue(r.reviewPriceReviewed),
                        numOrNull(r.reviewPriceCents),
                        numOrNull(r.reviewPriceMinCents),
                        numOrNull(r.reviewPriceMaxCents),
                      )
                    ) {
                      return <span className="text-stone-500 dark:text-stone-400">Unknown</span>;
                    }
                    return <Dash />;
                  })()
                  )}
                </td>
                <td className={`${adminTdClass} text-xs text-stone-500`}>{r.classifierSource ?? "—"}</td>
                <td className={`${adminTdClass} font-mono text-xs text-stone-500`}>
                  {formatConf(r.localConfidence, r.aiConfidence)}
                </td>
                <td className={`${adminTdClass} text-xs text-stone-500`}>{timeAgo(r.firstSeenAt)}</td>
                <td className={`${adminTdClass} align-top`}>
                  {(() => {
                    const snap = filter === "gold-eval" ? r.goldSnapshot : undefined;
                    return (
                      <ReviewRow
                        listingId={r.id}
                        currentBrand={snap ? snap.brand : r.brand}
                        currentReference={snap ? snap.reference : r.reference}
                        currentCondition={snap ? snap.condition : r.condition}
                        currentWatchType={snap ? snap.watchType : r.watchType}
                        currentPriceCents={snap ? snap.priceCents : numOrNull(r.priceCents)}
                        currentPriceMinCents={snap ? snap.priceMinCents : numOrNull(r.priceMinCents)}
                        currentPriceMaxCents={snap ? snap.priceMaxCents : numOrNull(r.priceMaxCents)}
                        initialNotes={snap != null ? snap.notes : (r.reviewNotes ?? null)}
                        initialPriceReviewUnknown={
                          snap != null
                            ? goldEvalPricesAreBlank(snap)
                            : Boolean(
                                sqlBoolTrue(r.reviewPriceReviewed) &&
                                  numOrNull(r.reviewPriceCents) == null &&
                                  numOrNull(r.reviewPriceMinCents) == null &&
                                  numOrNull(r.reviewPriceMaxCents) == null,
                              )
                        }
                        initialConditionReviewedUnknown={
                          snap != null
                            ? snap.condition === null
                            : Boolean(sqlBoolTrue(r.reviewConditionReviewed) && r.condition == null)
                        }
                        listingIsSold={snap != null ? snap.isSold === true : Boolean(r.isSold)}
                        initialSoldReviewed={sqlBoolTrue(r.reviewSoldReviewed)}
                        rowIsLowLocal={r.rowIsLowLocal}
                        initialLocalReviewed={sqlBoolTrue(r.reviewLocalReviewed)}
                        listingIsBundle={snap != null ? snap.isBundle === true : Boolean(r.isBundle)}
                        initialBundleReviewed={
                          snap != null ? snap.isBundle !== null : sqlBoolTrue(r.reviewBundleReviewed)
                        }
                        initialBrandReviewedUnknown={
                          snap != null
                            ? snap.brand === null || snap.brand === ""
                            : Boolean(sqlBoolTrue(r.reviewBrandReviewed) && r.brand == null)
                        }
                        initialWatchTypeUnknown={snap != null ? snap.watchType === null : false}
                        rowHasMultipleBrandHits={listingMultiBrandHitCount(r.title, r.description) >= 2}
                        initialMultiBrandReviewed={sqlBoolTrue(r.reviewMultiBrandReviewed)}
                        showRemoveGoldEval={filter === "gold-eval"}
                        initialInGoldEval={r.isInGoldEval}
                      />
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="text-stone-500 dark:text-stone-400">
            Page {effectivePage} of {totalPages}
          </div>
          <div className="flex gap-2">
            {effectivePage > 1 ? (
              <Link href={`/admin/review?${qp({ page: effectivePage - 1 })}`} className={adminBtnSecondaryClass}>
                Previous
              </Link>
            ) : (
              <span className={adminBtnMutedClass}>Previous</span>
            )}
            {effectivePage < totalPages ? (
              <Link href={`/admin/review?${qp({ page: effectivePage + 1 })}`} className={adminBtnSecondaryClass}>
                Next
              </Link>
            ) : (
              <span className={adminBtnMutedClass}>Next</span>
            )}
          </div>
        </nav>
      )}
    </AdminShell>
  );
}

function formatConf(local: string | null, ai: string | null): string {
  const l = Number(local ?? 0);
  const a = Number(ai ?? 0);
  if (l > 0 && a > 0) return `L${l.toFixed(2)}/A${a.toFixed(2)}`;
  if (l > 0) return `L${l.toFixed(2)}`;
  if (a > 0) return `A${a.toFixed(2)}`;
  return "—";
}

function FieldCell({
  value,
  source,
  confidence,
}: {
  value: string;
  source: string | null;
  confidence: string | null;
}) {
  const conf = Number(confidence ?? 0);
  const srcLabel = source ? source.charAt(0).toUpperCase() : "";
  return (
    <span className="text-stone-700 dark:text-stone-200">
      {value}
      {srcLabel && (
        <span className="ml-1 text-[10px] text-stone-400" title={`${source} ${conf > 0 ? conf.toFixed(3) : ""}`}>
          {srcLabel}
          {conf > 0 && <>{conf.toFixed(2)}</>}
        </span>
      )}
    </span>
  );
}

function GoldEvalUnknown() {
  return <span className="text-stone-500 dark:text-stone-400">Unknown</span>;
}

function GoldEvalBrandCell({ snapshot }: { snapshot: GoldEvalTableSnapshot }) {
  const b = snapshot.brand;
  if (b != null && b !== "") return <FieldCell value={b} source="gold" confidence={null} />;
  return <GoldEvalUnknown />;
}

function GoldEvalReferenceCell({ snapshot }: { snapshot: GoldEvalTableSnapshot }) {
  const ref = snapshot.reference;
  if (ref != null && ref !== "") return <FieldCell value={ref} source="gold" confidence={null} />;
  return <GoldEvalUnknown />;
}

function GoldEvalConditionCell({ snapshot }: { snapshot: GoldEvalTableSnapshot }) {
  const c = snapshot.condition;
  if (c != null && c !== "") return <FieldCell value={c} source="gold" confidence={null} />;
  return <FieldCell value="Unknown" source="gold" confidence={null} />;
}

function GoldEvalPriceCell({ snapshot }: { snapshot: GoldEvalTableSnapshot }) {
  const main = snapshot.priceCents;
  if (main != null && main > 0) return formatUsd(main);
  const lo = snapshot.priceMinCents;
  const hi = snapshot.priceMaxCents;
  if (lo != null && hi != null && lo > 0 && hi > 0) {
    return (
      <span className="text-stone-700 dark:text-stone-200">
        {formatUsd(lo)}–{formatUsd(hi)}
      </span>
    );
  }
  if (goldEvalPricesAreBlank(snapshot)) return <GoldEvalUnknown />;
  return <Dash />;
}

const REASON_COLORS: Record<string, string> = {
  "no-brand": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  "no-price": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  "no-condition": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  "low-local": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  bundle: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  sold: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200",
  "multi-brand": "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  "ref-low-conf": "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200",
};

function ReasonBadge({ reason }: { reason: string }) {
  const color = REASON_COLORS[reason] ?? "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${color}`}>
      {reason}
    </span>
  );
}

function ReviewedPastBadge() {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-900 dark:bg-emerald-900/45 dark:text-emerald-100">
      REVIEWED
    </span>
  );
}

function GoldEvalBadge() {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-950 dark:bg-amber-900/50 dark:text-amber-100">
      GOLD EVAL
    </span>
  );
}

function Dash() {
  return <span className="text-stone-400">—</span>;
}
