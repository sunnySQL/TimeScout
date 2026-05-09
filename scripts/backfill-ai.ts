/**
 * AI-classify existing listings whose `condition` AND `watch_type` are both
 * still null after the regex-based parsers. Runs OpenAI on stored title +
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
import { and, isNull, sql } from "drizzle-orm";
import { getDb, getPool } from "../db";
import { listings } from "../db/schema";
import { classifyListing, isAiAvailable } from "../lib/ai/classify";

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
        isNull(listings.condition),
        isNull(listings.watchType),
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
  let labeledCondition = 0;
  let labeledWatchType = 0;
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
    if (result.condition == null && result.watchType == null) {
      nullResult++;
      continue;
    }
    if (result.confidence < args.minConfidence) {
      lowConfidence++;
      continue;
    }

    if (result.condition) labeledCondition++;
    if (result.watchType) labeledWatchType++;

    if (args.dryRun) continue;

    const confStr = result.confidence.toFixed(3);
    const set: Record<string, unknown> = {
      aiConfidence: result.confidence.toFixed(2),
      aiClassifiedAt: new Date(),
      classifierSource: "ai",
    };
    if (result.condition) {
      set.condition = sql`COALESCE(\`condition\`, ${result.condition})`;
      set.conditionSource = sql`COALESCE(condition_source, 'ai')`;
      set.conditionConfidence = sql`COALESCE(condition_confidence, ${confStr})`;
    }
    if (result.watchType) {
      set.watchType = sql`COALESCE(watch_type, ${result.watchType})`;
      set.watchTypeSource = sql`COALESCE(watch_type_source, 'ai')`;
      set.watchTypeConfidence = sql`COALESCE(watch_type_confidence, ${confStr})`;
    }

    await db
      .update(listings)
      .set(set)
      .where(
        sql`source_id = ${row.sourceId} AND external_id = ${row.externalId}`,
      );

    if (attempted % 25 === 0) {
      console.log(
        `  …${attempted}/${rows.length} processed` +
          ` (cond=${labeledCondition}, type=${labeledWatchType},` +
          ` low=${lowConfidence}, null=${nullResult})`,
      );
    }
  }

  console.log(
    `[ai-backfill] done in ${((Date.now() - started) / 1000).toFixed(1)}s.\n` +
      `  Attempted          : ${attempted}\n` +
      `  Labeled condition  : ${labeledCondition}\n` +
      `  Labeled watch_type : ${labeledWatchType}\n` +
      `  Low confidence     : ${lowConfidence}\n` +
      `  No usable result   : ${nullResult}` +
      (args.dryRun ? "\n  (dry-run: nothing written)" : ""),
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
