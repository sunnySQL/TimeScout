/**
 * Re-run parsers over every listing and update stale parsed fields.
 *
 * Currently re-runs:
 *   - Watch title parser → brand + reference
 *   - USD price extractor over title + description (body). When an exact price
 *     is parsed from text, any stale flair bucket bounds (price_min/max_cents)
 *     are cleared so the UI shows the exact figure, not formatUsdRange().
 *   - Bundle detector → is_bundle
 *   - Sold detector (title-only, since flair isn't stored on the row) →
 *     is_sold. This catches posts where the seller edited the title to
 *     `[SOLD]` but we never reran ingest. Flair-based sold detection
 *     happens live in the ingester / rescue-prices flow.
 *
 * Usage:
 *   npm run backfill:parse
 *   npm run backfill:parse -- --only-missing   # rows missing brand/price
 *   npm run backfill:parse -- --no-price       # skip price re-parse
 */

import "dotenv/config";
import { eq, isNull, or, sql } from "drizzle-orm";
import { getDb, getPool } from "../db";
import { listingLabelReviews, listings } from "../db/schema";
import { detectSold, extractCondition, extractWatchType, extractUsdPriceCents } from "../lib/reddit/browse";
import { parseWatch } from "../lib/watches/parse";
import { detectBundle } from "../lib/watches/bundle";

async function main() {
  const onlyMissing = process.argv.includes("--only-missing");
  const skipPrice = process.argv.includes("--no-price");
  const db = getDb();

  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      description: listings.description,
      brand: listings.brand,
      reference: listings.reference,
      brandSource: listings.brandSource,
      referenceSource: listings.referenceSource,
      conditionSource: listings.conditionSource,
      watchTypeSource: listings.watchTypeSource,
      priceCents: listings.priceCents,
      priceMinCents: listings.priceMinCents,
      priceMaxCents: listings.priceMaxCents,
      condition: listings.condition,
      watchType: listings.watchType,
      isBundle: listings.isBundle,
      isSold: listings.isSold,
      bundleReviewed: listingLabelReviews.bundleReviewed,
    })
    .from(listings)
    .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
    .where(
      onlyMissing
        ? or(isNull(listings.brand), isNull(listings.reference), isNull(listings.priceCents), isNull(listings.condition))
        : sql`1=1`,
    );

  console.log(
    `Parsing ${rows.length} listings${onlyMissing ? " (only missing)" : ""}${skipPrice ? " [skipping price]" : ""}…`,
  );

  let updatedBrand = 0;
  let updatedPrice = 0;
  let clearedFlairBounds = 0;
  let updatedBundle = 0;
  let updatedSold = 0;
  let updatedCondition = 0;
  let updatedWatchType = 0;

  const PROTECTED_SOURCES = new Set(["manual", "local", "ai"]);

  for (const row of rows) {
    const parsed = parseWatch(row.title);
    const nextBrand = parsed.brand;
    const nextRef = parsed.reference;
    const nextBundle = detectBundle(row.title, row.description);
    const nextSold = detectSold({ title: row.title, flair: null });
    const nextCondition = extractCondition(row.title, row.description);
    const nextWatchType = extractWatchType(row.title, row.description);

    let nextPrice: number | null = row.priceCents ?? null;
    /** Exact USD from title/body — wins over any stored flair midpoint + bounds. */
    let reparsed: number | null = null;
    if (!skipPrice) {
      reparsed = extractUsdPriceCents(row.title, row.description);
      if (reparsed != null) nextPrice = reparsed;
    }

    // Regex may fill a field only when:
    //   - current value is null, OR
    //   - current source is null / "regex" / "legacy" (not a higher-trust source)
    function canRegexWrite(currentVal: unknown, currentSource: string | null): boolean {
      if (currentVal == null) return true;
      if (!currentSource || currentSource === "regex" || currentSource === "legacy") return true;
      return !PROTECTED_SOURCES.has(currentSource);
    }

    const brandOk = nextBrand != null && nextBrand !== (row.brand ?? null)
      && canRegexWrite(row.brand, row.brandSource);
    const refOk = nextRef != null && nextRef !== (row.reference ?? null)
      && canRegexWrite(row.reference, row.referenceSource);
    const conditionOk = nextCondition != null && nextCondition !== (row.condition ?? null)
      && canRegexWrite(row.condition, row.conditionSource);
    const watchTypeOk = nextWatchType != null && nextWatchType !== (row.watchType ?? null)
      && canRegexWrite(row.watchType, row.watchTypeSource);
    const priceChanged = !skipPrice && nextPrice !== (row.priceCents ?? null);
    const flairBoundsStale =
      !skipPrice &&
      reparsed != null &&
      (row.priceMinCents != null || row.priceMaxCents != null);
    const bundleManualLocked = Boolean(row.bundleReviewed);
    const bundleChanged =
      !bundleManualLocked && nextBundle !== row.isBundle;
    const soldChanged = nextSold && !row.isSold;

    if (
      !brandOk &&
      !refOk &&
      !conditionOk &&
      !watchTypeOk &&
      !priceChanged &&
      !flairBoundsStale &&
      !bundleChanged &&
      !soldChanged
    )
      continue;

    const set: Record<string, unknown> = {};
    let anyClassified = false;

    if (bundleChanged) set.isBundle = nextBundle;

    if (brandOk) {
      set.brand = nextBrand;
      set.brandSource = "regex";
      set.brandConfidence = null;
      anyClassified = true;
    }
    if (refOk) {
      set.reference = nextRef;
      set.referenceSource = "regex";
      set.referenceConfidence = null;
      anyClassified = true;
    }
    if (priceChanged) set.priceCents = nextPrice ?? undefined;
    if (flairBoundsStale) {
      set.priceMinCents = null;
      set.priceMaxCents = null;
    }
    if (soldChanged) {
      set.isSold = true;
      set.soldAt = new Date();
    }
    if (conditionOk) {
      set.condition = nextCondition;
      set.conditionSource = "regex";
      set.conditionConfidence = null;
      anyClassified = true;
    }
    if (watchTypeOk) {
      set.watchType = nextWatchType;
      set.watchTypeSource = "regex";
      set.watchTypeConfidence = null;
      anyClassified = true;
    }
    if (anyClassified) set.classifierSource = "regex";

    await db.update(listings).set(set).where(eq(listings.id, row.id));

    if (brandOk || refOk) updatedBrand++;
    if (priceChanged || flairBoundsStale) updatedPrice++;
    if (flairBoundsStale) clearedFlairBounds++;
    if (bundleChanged) updatedBundle++;
    if (soldChanged) updatedSold++;
    if (conditionOk) updatedCondition++;
    if (watchTypeOk) updatedWatchType++;
  }

  console.log(
    `Done. Updated ${updatedBrand} brand/ref, ${updatedPrice} price (incl. ${clearedFlairBounds} flair-bound clears), ${updatedBundle} bundle-flag, ${updatedSold} sold-flag, ${updatedCondition} condition, ${updatedWatchType} watch-type row(s).`,
  );
  await getPool().end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await getPool().end();
  } catch {}
  process.exit(1);
});
