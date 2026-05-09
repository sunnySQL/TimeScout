import { and, eq, like, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { listingGoldEval, listings } from "@/db/schema";

/** Trim URL `q` param for review queue search. */
export function trimReviewSearchInput(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return (raw[0] ?? "").trim();
  return typeof raw === "string" ? raw.trim() : "";
}

/** Escape `%`, `_`, and `\` for SQL LIKE patterns */
export function escapeMysqlLikePattern(segment: string): string {
  return segment.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Case-sensitive LIKE match on listing columns + exact ID match when `q` is all digits.
 * Returns undefined when search is empty (caller should omit WHERE fragment).
 */
export function reviewListingsSearchWhere(searchTrimmed: string): SQL | undefined {
  const q = searchTrimmed.trim();
  if (!q) return undefined;

  const esc = escapeMysqlLikePattern(q);
  const pattern = `%${esc}%`;

  const parts: SQL[] = [
    like(listings.title, pattern),
    like(listings.brand, pattern),
    like(listings.reference, pattern),
    like(listings.listingUrl, pattern),
  ];

  if (/^\d+$/.test(q)) {
    const id = Number(q);
    if (Number.isSafeInteger(id) && id > 0) {
      parts.push(eq(listings.id, id));
    }
  }

  return parts.length === 1 ? parts[0]! : or(...parts);
}

/**
 * Gold eval tab: same as {@link reviewListingsSearchWhere} on live listing columns, plus
 * LIKE on frozen `listing_gold_eval.brand` / `listing_gold_eval.reference`.
 */
export function reviewGoldEvalTabSearchWhere(searchTrimmed: string): SQL | undefined {
  const base = reviewListingsSearchWhere(searchTrimmed);
  const q = searchTrimmed.trim();
  if (!q) return undefined;

  const esc = escapeMysqlLikePattern(q);
  const pattern = `%${esc}%`;

  const goldOr = or(
    like(listingGoldEval.brand, pattern),
    like(listingGoldEval.reference, pattern),
  )!;

  return base ? or(base, goldOr)! : goldOr;
}

/** AND-combine tab predicate with optional search; leaves base unchanged when search empty. */
export function andReviewSearch(base: SQL, searchWhere: SQL | undefined): SQL {
  return searchWhere ? and(base, searchWhere)! : base;
}

/** Truthy WHERE placeholder when Drizzle requires a `.where()` clause. */
export function sqlTrue(): SQL {
  return sql`TRUE`;
}
