import { and, asc, desc, eq, gte, inArray, isNull, like, lte, or, sql, SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { listings, sources } from "@/db/schema";

export type SortKey = "relevance" | "price_asc" | "price_desc" | "newest";

export type SearchParams = {
  q?: string;
  /**
   * Brand filter. Accepts either a single brand name (e.g. "Rolex") or an
   * array of brand names for multi-select OR-matching ("Rolex" OR "Omega").
   */
  brand?: string | string[];
  minPrice?: number;
  maxPrice?: number;
  state?: string;
  condition?: string;
  watchType?: string;
  sort?: SortKey;
  limit?: number;
  offset?: number;
  /**
   * If true, include listings outside the default freshness window. Defaults
   * to false (stale listings are hidden).
   */
  includeStale?: boolean;
  /**
   * When `includeStale` is false, only rows with `last_seen_at` within this
   * many hours are included. If omitted, uses `DEFAULT_STALE_AFTER_DAYS` in
   * SQL (`INTERVAL n DAY`).
   */
  staleAfterHours?: number;
  /**
   * If true, include multi-watch bundle/wholesale listings that are flagged
   * at ingest. Defaults to false (bundles hidden from the default grid).
   */
  includeBundles?: boolean;
  /**
   * If true, include **recent** sold listings only: `sold_at` within
   * `SOLD_VISIBLE_HOURS`. Older sold rows stay in the DB but never appear in
   * search. Defaults to false (hide all sold).
   */
  includeSold?: boolean;
};

/**
 * Listings whose `last_seen_at` is older than this are hidden from the
 * default index (home count, `/search`, brand facets). Same as 3×24h.
 */
export const DEFAULT_STALE_AFTER_DAYS = 3;
export const DEFAULT_STALE_AFTER_HOURS = DEFAULT_STALE_AFTER_DAYS * 24;

/** When "Include sold" is on, only sold rows with `sold_at` in this window appear. */
export const SOLD_VISIBLE_HOURS = 24;

/**
 * Collapse a raw `brand` query parameter (possibly a string, array, or
 * undefined) into a deduped list of non-empty values. Exported so callers
 * that need to know how many brands are selected can share one canonical
 * implementation.
 */
export function normalizeBrandParam(
  value: string | string[] | undefined,
): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const trimmed = v?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export type SearchResult = {
  rows: Array<{
    id: number;
    title: string;
    brand: string | null;
    reference: string | null;
    brandRaw: string | null;
    modelRaw: string | null;
    referenceRaw: string | null;
    priceCents: number | null;
    priceMinCents: number | null;
    priceMaxCents: number | null;
    currency: string;
    condition: string | null;
    watchType: string | null;
    listingUrl: string;
    imageUrl: string | null;
    region: string | null;
    lastSeenAt: Date;
    isSold: boolean;
    sourceName: string;
    sourceSlug: string;
  }>;
  total: number;
};

export async function searchListings(params: SearchParams): Promise<SearchResult> {
  const db = getDb();
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const filters: SQL[] = [];

  if (params.q && params.q.trim().length > 0) {
    const q = `%${params.q.trim()}%`;
    const qOr = or(
      like(listings.title, q),
      like(listings.brand, q),
      like(listings.reference, q),
      like(listings.brandRaw, q),
      like(listings.modelRaw, q),
      like(listings.referenceRaw, q),
    );
    if (qOr) filters.push(qOr);
  }
  const brandList = normalizeBrandParam(params.brand);
  if (brandList.length === 1) {
    filters.push(eq(listings.brand, brandList[0]));
  } else if (brandList.length > 1) {
    filters.push(inArray(listings.brand, brandList));
  }
  if (params.minPrice != null)
    filters.push(gte(listings.priceCents, Math.round(params.minPrice * 100)));
  if (params.maxPrice != null)
    filters.push(lte(listings.priceCents, Math.round(params.maxPrice * 100)));
  if (params.state) filters.push(eq(listings.region, params.state));
  if (params.condition === "n/a") {
    filters.push(isNull(listings.condition));
  } else if (params.condition) {
    filters.push(eq(listings.condition, params.condition));
  }
  if (params.watchType) filters.push(eq(listings.watchType, params.watchType));

  if (!params.includeStale) {
    // MySQL INTERVAL literal must be inlined (not a bound param).
    if (params.staleAfterHours != null) {
      const hours = Math.floor(params.staleAfterHours);
      filters.push(
        sql`${listings.lastSeenAt} >= (NOW() - INTERVAL ${sql.raw(String(hours))} HOUR)`,
      );
    } else {
      const days = Math.floor(DEFAULT_STALE_AFTER_DAYS);
      filters.push(
        sql`${listings.lastSeenAt} >= (NOW() - INTERVAL ${sql.raw(String(days))} DAY)`,
      );
    }
  }

  if (!params.includeBundles) {
    filters.push(eq(listings.isBundle, false));
  }

  filters.push(soldVisibilityFilter(params.includeSold));

  const where = filters.length > 0 ? and(...filters) : undefined;

  const orderBy = (() => {
    switch (params.sort) {
      case "price_asc":
        return [asc(listings.priceCents)];
      case "price_desc":
        return [desc(listings.priceCents)];
      case "newest":
        return [desc(listings.firstSeenAt)];
      default:
        return [desc(listings.lastSeenAt)];
    }
  })();

  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      brand: listings.brand,
      reference: listings.reference,
      brandRaw: listings.brandRaw,
      modelRaw: listings.modelRaw,
      referenceRaw: listings.referenceRaw,
      priceCents: listings.priceCents,
      priceMinCents: listings.priceMinCents,
      priceMaxCents: listings.priceMaxCents,
      currency: listings.currency,
      condition: listings.condition,
      watchType: listings.watchType,
      listingUrl: listings.listingUrl,
      imageUrl: listings.imageUrl,
      region: listings.region,
      lastSeenAt: listings.lastSeenAt,
      isSold: listings.isSold,
      sourceName: sources.name,
      sourceSlug: sources.slug,
    })
    .from(listings)
    .innerJoin(sources, eq(sources.id, listings.sourceId))
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const totalRows = await db
    .select({ id: listings.id })
    .from(listings)
    .where(where);

  return { rows, total: totalRows.length };
}

type FacetOptions = {
  includeStale?: boolean;
  includeBundles?: boolean;
  includeSold?: boolean;
};

/**
 * Default search: no sold rows. With `includeSold`, only sold rows where
 * `sold_at` is set and within the last `SOLD_VISIBLE_HOURS` hours.
 */
function soldVisibilityFilter(includeSold: boolean | undefined): SQL {
  if (!includeSold) return eq(listings.isSold, false);
  const h = Math.floor(SOLD_VISIBLE_HOURS);
  return or(
    eq(listings.isSold, false),
    and(
      eq(listings.isSold, true),
      sql`${listings.soldAt} IS NOT NULL`,
      sql`${listings.soldAt} >= (NOW() - INTERVAL ${sql.raw(String(h))} HOUR)`,
    ),
  )!;
}

/**
 * Shared filter for brand/count/total queries so facets match what a user
 * actually sees on /search (stale/bundle/sold all hidden by default).
 */
function facetFilter(options: FacetOptions) {
  const parts: SQL[] = [];
  if (!options.includeStale) {
    const days = Math.floor(DEFAULT_STALE_AFTER_DAYS);
    parts.push(
      sql`${listings.lastSeenAt} >= (NOW() - INTERVAL ${sql.raw(String(days))} DAY)`,
    );
  }
  if (!options.includeBundles) parts.push(eq(listings.isBundle, false));
  parts.push(soldVisibilityFilter(options.includeSold));
  if (parts.length === 0) return sql`1=1`;
  return and(...parts)!;
}

export async function listBrands(options: FacetOptions = {}): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ brand: listings.brand })
    .from(listings)
    .where(facetFilter(options));
  return rows
    .map((r) => r.brand)
    .filter((b): b is string => Boolean(b))
    .sort((a, b) => a.localeCompare(b));
}

export type BrandCount = { brand: string; count: number };

export async function topBrands(
  limit = 12,
  options: FacetOptions = {},
): Promise<BrandCount[]> {
  const db = getDb();
  const rows = await db
    .select({
      brand: listings.brand,
      count: sql<number>`COUNT(*)`,
    })
    .from(listings)
    .where(and(sql`${listings.brand} IS NOT NULL`, facetFilter(options)))
    .groupBy(listings.brand)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);

  return rows
    .filter((r): r is { brand: string; count: number } => Boolean(r.brand))
    .map((r) => ({ brand: r.brand, count: Number(r.count) }));
}

/**
 * Count of listings shown in the default index: not sold (unless
 * `includeSold`), not bundles (unless `includeBundles`), and `last_seen_at`
 * within `DEFAULT_STALE_AFTER_DAYS` unless `includeStale`.
 */
export async function totalListings(options: FacetOptions = {}): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(listings)
    .where(facetFilter(options));
  return Number(rows[0]?.count ?? 0);
}
