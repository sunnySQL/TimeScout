/**
 * Run local ML classifiers over existing listings that still have null
 * condition, watch_type, brand, or reference. Free and fast.
 *
 * Per-field confidence thresholds are defined in lib/classifier/thresholds.ts
 * (LOCAL_THRESHOLDS). No per-invocation override — edit the constants if you
 * need to experiment.
 *
 * Skips rows already processed by the local classifier
 * (local_classified_at IS NOT NULL) unless --force is passed.
 *
 * Usage:
 *   npm run backfill:local
 *   npm run backfill:local -- --limit 2000
 *   npm run backfill:local -- --force        # reclassify even previously done rows
 */

import "dotenv/config";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb, getPool } from "../db";
import { listings } from "../db/schema";
import { classifyLocal, isLocalAvailable } from "../lib/ml/index";
import { LOCAL_THRESHOLDS } from "../lib/classifier/thresholds";

type Args = {
  limit: number;
  force: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limit = 500;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--limit" && next) {
      limit = Math.max(1, Math.min(10000, Number(next) || 500));
      i++;
    } else if (a === "--force") {
      force = true;
    }
  }
  return { limit, force };
}

async function main() {
  const args = parseArgs();

  if (!isLocalAvailable()) {
    console.error("Model files not found in models/. Train first: cd ml && python3 train_condition.py");
    process.exit(1);
  }

  const db = getDb();

  const whereConditions = [
    or(
      isNull(listings.condition),
      isNull(listings.watchType),
      isNull(listings.brand),
      isNull(listings.reference),
    ),
  ];
  if (!args.force) {
    whereConditions.push(isNull(listings.localClassifiedAt));
  }

  const rows = await db
    .select({
      id: listings.id,
      sourceId: listings.sourceId,
      externalId: listings.externalId,
      title: listings.title,
      description: listings.description,
      condition: listings.condition,
      watchType: listings.watchType,
      brand: listings.brand,
      reference: listings.reference,
    })
    .from(listings)
    .where(and(...whereConditions))
    .limit(args.limit);

  console.log(
    `[local-backfill] candidates: ${rows.length}` +
      ` (limit=${args.limit}${args.force ? ", force" : ""})`,
  );

  let attempted = 0;
  let labeledCondition = 0;
  let labeledWatchType = 0;
  let labeledBrand = 0;
  let labeledReference = 0;
  const started = Date.now();

  for (const row of rows) {
    attempted++;
    const local = classifyLocal({
      title: row.title,
      body: row.description,
    });

    const set: Record<string, unknown> = {};
    let labeled = false;
    const appliedConfs: number[] = [];

    if (
      row.condition == null &&
      local.condition &&
      local.condition.confidence >= LOCAL_THRESHOLDS.condition
    ) {
      set.condition = local.condition.label;
      set.conditionSource = "local";
      set.conditionConfidence = local.condition.confidence.toFixed(3);
      appliedConfs.push(local.condition.confidence);
      labeledCondition++;
      labeled = true;
    }

    if (
      row.watchType == null &&
      local.watchType &&
      local.watchType.confidence >= LOCAL_THRESHOLDS.watchType
    ) {
      set.watchType = local.watchType.label;
      set.watchTypeSource = "local";
      set.watchTypeConfidence = local.watchType.confidence.toFixed(3);
      appliedConfs.push(local.watchType.confidence);
      labeledWatchType++;
      labeled = true;
    }

    if (
      row.brand == null &&
      local.brand &&
      local.brand.confidence >= LOCAL_THRESHOLDS.brand
    ) {
      set.brand = local.brand.label;
      set.brandSource = "local";
      set.brandConfidence = local.brand.confidence.toFixed(3);
      appliedConfs.push(local.brand.confidence);
      labeledBrand++;
      labeled = true;
    }

    if (
      row.reference == null &&
      local.reference &&
      local.reference.confidence >= LOCAL_THRESHOLDS.reference
    ) {
      set.reference = local.reference.label;
      set.referenceSource = "local";
      set.referenceConfidence = local.reference.confidence.toFixed(3);
      appliedConfs.push(local.reference.confidence);
      labeledReference++;
      labeled = true;
    }

    if (labeled) {
      const minConf = Math.min(...appliedConfs);
      set.localConfidence = minConf.toFixed(2);
      set.localClassifiedAt = new Date();
      set.classifierSource = "local";
    } else {
      set.localClassifiedAt = new Date();
      set.localConfidence = "0.00";
    }

    await db.update(listings).set(set).where(eq(listings.id, row.id));

    if (attempted % 100 === 0) {
      console.log(
        `  …${attempted}/${rows.length}` +
          ` (cond=${labeledCondition}, type=${labeledWatchType},` +
          ` brand=${labeledBrand}, ref=${labeledReference})`,
      );
    }
  }

  console.log(
    `[local-backfill] done in ${((Date.now() - started) / 1000).toFixed(1)}s.\n` +
      `  Attempted          : ${attempted}\n` +
      `  Labeled condition  : ${labeledCondition}\n` +
      `  Labeled watch_type : ${labeledWatchType}\n` +
      `  Labeled brand      : ${labeledBrand}\n` +
      `  Labeled reference  : ${labeledReference}`,
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
