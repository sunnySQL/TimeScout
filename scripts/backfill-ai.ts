/**
 * AI-extract existing listings whose structured fields are still missing or
 * approximate after regex/local passes. Runs OpenAI on stored title +
 * description only — does NOT re-fetch OP comments from Reddit.
 *
 * Cost guardrails:
 *   - Skips rows already classified by AI (`ai_classified_at IS NOT NULL`)
 *   - Hard cap via `--limit` (default 100)
 *   - Confidence floor via `--min-confidence` (default 0.6)
 *   - Dry-run mode (`--dry-run`) calls the API but does not write
 *
 * Usage:
 *   npm run backfill:ai
 *   npm run backfill:ai -- --limit 500 --min-confidence 0.7
 *   npm run backfill:ai -- --dry-run
 */

import "dotenv/config";
import { and, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb, getPool } from "../db";
import { listings } from "../db/schema";
import {
  aiFieldConfidence,
  classifyListing,
  hasUsableAiExtraction,
  isAiAvailable,
  type AiExtraction,
} from "../lib/ai/classify";

type Args = {
  limit: number;
  minConfidence: number;
  dryRun: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limit = 100;
  let minConfidence = 0.6;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--limit" && next) {
      limit = Math.max(1, Math.min(5000, Number(next) || 100));
      i++;
    } else if (a === "--min-confidence" && next) {
      minConfidence = Math.max(0, Math.min(1, Number(next) || 0.6));
      i++;
    } else if (a === "--dry-run") {
      dryRun = true;
    }
  }
  return { limit, minConfidence, dryRun };
}

async function main() {
  const args = parseArgs();

  if (!isAiAvailable()) {
    console.error("OPENAI_API_KEY is not set. Aborting.");
    process.exit(1);
  }

  const db = getDb();
  const rows = await db
    .select({
      id: listings.id,
      sourceId: listings.sourceId,
      externalId: listings.externalId,
      title: listings.title,
      description: listings.description,
    })
    .from(listings)
    .where(
      and(
        or(
          isNull(listings.brand),
          isNull(listings.reference),
          isNull(listings.priceCents),
          isNotNull(listings.priceMinCents),
          isNotNull(listings.priceMaxCents),
          isNull(listings.condition),
        ),
        isNull(listings.aiClassifiedAt),
      ),
    )
    .limit(args.limit);

  console.log(
    `[ai-backfill] candidates: ${rows.length}` +
      ` (limit=${args.limit}, min-confidence=${args.minConfidence}` +
      `${args.dryRun ? ", dry-run" : ""})`,
  );

  let attempted = 0;
  let labeledBrand = 0;
  let labeledModel = 0;
  let labeledReference = 0;
  let labeledPrice = 0;
  let labeledCondition = 0;
  let labeledWatchType = 0;
  let labeledBundle = 0;
  let labeledSold = 0;
  let lowConfidence = 0;
  let nullResult = 0;
  const started = Date.now();

  for (const row of rows) {
    attempted++;
    const result = await classifyListing({
      title: row.title,
      body: row.description,
    });

    if (!result) {
      nullResult++;
      continue;
    }
    if (!hasUsableAiExtraction(result, args.minConfidence)) {
      lowConfidence++;
      continue;
    }

    if (result.brand && aiFieldConfidence(result, "brand") >= args.minConfidence) labeledBrand++;
    if (result.model && aiFieldConfidence(result, "model") >= args.minConfidence) labeledModel++;
    if (result.reference && aiFieldConfidence(result, "reference") >= args.minConfidence) labeledReference++;
    if (result.priceCents != null && aiFieldConfidence(result, "price") >= args.minConfidence) labeledPrice++;
    if (result.condition && aiFieldConfidence(result, "condition") >= args.minConfidence) labeledCondition++;
    if (result.watchType && aiFieldConfidence(result, "watchType") >= args.minConfidence) labeledWatchType++;
    if (result.isBundle === true && aiFieldConfidence(result, "isBundle") >= args.minConfidence) labeledBundle++;
    if (result.isSold === true && aiFieldConfidence(result, "isSold") >= args.minConfidence) labeledSold++;

    if (args.dryRun) continue;

    const set = buildAiUpdateSet(result, args.minConfidence);

    await db
      .update(listings)
      .set(set)
      .where(
        sql`source_id = ${row.sourceId} AND external_id = ${row.externalId}`,
      );

    if (attempted % 25 === 0) {
      console.log(
        `  …${attempted}/${rows.length} processed` +
          ` (brand=${labeledBrand}, ref=${labeledReference}, price=${labeledPrice},` +
          ` cond=${labeledCondition}, type=${labeledWatchType},` +
          ` low=${lowConfidence}, null=${nullResult})`,
      );
    }
  }

  console.log(
    `[ai-backfill] done in ${((Date.now() - started) / 1000).toFixed(1)}s.\n` +
      `  Attempted          : ${attempted}\n` +
      `  Labeled brand      : ${labeledBrand}\n` +
      `  Labeled model      : ${labeledModel}\n` +
      `  Labeled reference  : ${labeledReference}\n` +
      `  Labeled price      : ${labeledPrice}\n` +
      `  Labeled condition  : ${labeledCondition}\n` +
      `  Labeled watch_type : ${labeledWatchType}\n` +
      `  Marked bundle      : ${labeledBundle}\n` +
      `  Marked sold        : ${labeledSold}\n` +
      `  Low confidence     : ${lowConfidence}\n` +
      `  No usable result   : ${nullResult}` +
      (args.dryRun ? "\n  (dry-run: nothing written)" : ""),
  );

  await getPool().end();
}

function fieldOk(
  result: AiExtraction,
  field: Parameters<typeof aiFieldConfidence>[1],
  minConfidence: number,
): boolean {
  return aiFieldConfidence(result, field) >= minConfidence;
}

function buildAiUpdateSet(
  result: AiExtraction,
  minConfidence: number,
): Record<string, unknown> {
  const set: Record<string, unknown> = {
    aiConfidence: result.confidence.toFixed(2),
    aiClassifiedAt: new Date(),
    classifierSource: "ai",
  };

  if (result.brand && fieldOk(result, "brand", minConfidence)) {
    const confStr = aiFieldConfidence(result, "brand").toFixed(3);
    set.brand = sql`COALESCE(brand, ${result.brand})`;
    set.brandSource = sql`COALESCE(brand_source, 'ai')`;
    set.brandConfidence = sql`COALESCE(brand_confidence, ${confStr})`;
  }
  if (result.model && fieldOk(result, "model", minConfidence)) {
    set.modelRaw = sql`COALESCE(model_raw, ${result.model})`;
  }
  if (result.reference && fieldOk(result, "reference", minConfidence)) {
    const confStr = aiFieldConfidence(result, "reference").toFixed(3);
    set.reference = sql`COALESCE(\`reference\`, ${result.reference})`;
    set.referenceSource = sql`COALESCE(reference_source, 'ai')`;
    set.referenceConfidence = sql`COALESCE(reference_confidence, ${confStr})`;
  }
  if (result.priceCents != null && fieldOk(result, "price", minConfidence)) {
    set.priceCents = sql`
      CASE
        WHEN price_cents IS NULL OR price_min_cents IS NOT NULL OR price_max_cents IS NOT NULL
        THEN ${result.priceCents}
        ELSE price_cents
      END`;
    set.priceMinCents = sql`
      CASE
        WHEN price_cents IS NULL OR price_min_cents IS NOT NULL OR price_max_cents IS NOT NULL
        THEN ${result.priceMinCents}
        ELSE price_min_cents
      END`;
    set.priceMaxCents = sql`
      CASE
        WHEN price_cents IS NULL OR price_min_cents IS NOT NULL OR price_max_cents IS NOT NULL
        THEN ${result.priceMaxCents}
        ELSE price_max_cents
      END`;
  }
  if (result.condition && fieldOk(result, "condition", minConfidence)) {
    const confStr = aiFieldConfidence(result, "condition").toFixed(3);
    set.condition = sql`COALESCE(\`condition\`, ${result.condition})`;
    set.conditionSource = sql`COALESCE(condition_source, 'ai')`;
    set.conditionConfidence = sql`COALESCE(condition_confidence, ${confStr})`;
  }
  if (result.watchType && fieldOk(result, "watchType", minConfidence)) {
    const confStr = aiFieldConfidence(result, "watchType").toFixed(3);
    set.watchType = sql`COALESCE(watch_type, ${result.watchType})`;
    set.watchTypeSource = sql`COALESCE(watch_type_source, 'ai')`;
    set.watchTypeConfidence = sql`COALESCE(watch_type_confidence, ${confStr})`;
  }
  if (result.isBundle === true && fieldOk(result, "isBundle", minConfidence)) {
    set.isBundle = sql`
      CASE
        WHEN EXISTS (
          SELECT 1 FROM listing_label_reviews lr
          WHERE lr.listing_id = listings.id AND lr.bundle_reviewed IS TRUE
        )
        THEN is_bundle
        ELSE TRUE
      END`;
  }
  if (result.isSold === true && fieldOk(result, "isSold", minConfidence)) {
    set.isSold = true;
    set.soldAt = sql`COALESCE(sold_at, CURRENT_TIMESTAMP)`;
  }

  return set;
}

main().catch(async (err) => {
  console.error(err);
  try {
    await getPool().end();
  } catch {}
  process.exit(1);
});
