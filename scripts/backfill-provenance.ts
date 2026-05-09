/**
 * One-time safe backfill: populate *_source columns for existing rows that
 * have a label value but a null source.
 *
 * Inference rules (conservative — avoids false attribution):
 *
 *   - If classifierSource is "regex", "local", "ai", or "manual", use it
 *     as the field source for all non-null fields lacking a source.
 *   - Special case: condition/watchType get "ai" only when classifierSource
 *     is explicitly "ai" (aiClassifiedAt alone is not sufficient — it means
 *     an AI pass was *attempted*, not that it produced the current value).
 *   - localClassifiedAt is never used for inference — it means the local
 *     classifier ran, not that it produced any particular field's value.
 *   - Everything else gets "legacy" (unknown pre-provenance origin).
 *
 * This script is idempotent — it never overwrites an existing non-null *_source.
 *
 * Usage:
 *   npm run backfill:provenance
 *   npm run backfill:provenance -- --dry-run
 */

import "dotenv/config";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { getDb, getPool } from "../db";
import { listings } from "../db/schema";

const TRUSTWORTHY_SOURCES = new Set(["regex", "local", "ai", "manual"]);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = getDb();

  const rows = await db
    .select({
      id: listings.id,
      brand: listings.brand,
      reference: listings.reference,
      condition: listings.condition,
      watchType: listings.watchType,
      brandSource: listings.brandSource,
      referenceSource: listings.referenceSource,
      conditionSource: listings.conditionSource,
      watchTypeSource: listings.watchTypeSource,
      classifierSource: listings.classifierSource,
    })
    .from(listings)
    .where(
      or(
        and(isNotNull(listings.brand), isNull(listings.brandSource)),
        and(isNotNull(listings.reference), isNull(listings.referenceSource)),
        and(isNotNull(listings.condition), isNull(listings.conditionSource)),
        and(isNotNull(listings.watchType), isNull(listings.watchTypeSource)),
      ),
    );

  console.log(
    `[provenance-backfill] Found ${rows.length} rows with missing source columns${dryRun ? " (dry run)" : ""}`,
  );

  let updated = 0;
  const sourceCounts: Record<string, number> = {};

  for (const row of rows) {
    const set: Record<string, string> = {};

    const cs = row.classifierSource;
    const trusted = cs && TRUSTWORTHY_SOURCES.has(cs) ? cs : null;

    if (row.brand && !row.brandSource) {
      set.brandSource = trusted ?? "legacy";
    }
    if (row.reference && !row.referenceSource) {
      set.referenceSource = trusted ?? "legacy";
    }
    if (row.condition && !row.conditionSource) {
      set.conditionSource = trusted ?? "legacy";
    }
    if (row.watchType && !row.watchTypeSource) {
      set.watchTypeSource = trusted ?? "legacy";
    }

    if (Object.keys(set).length === 0) continue;

    for (const v of Object.values(set)) {
      sourceCounts[v] = (sourceCounts[v] ?? 0) + 1;
    }

    if (!dryRun) {
      await db.update(listings).set(set).where(eq(listings.id, row.id));
    }
    updated++;

    if (updated % 500 === 0) {
      console.log(`  …${updated} rows processed`);
    }
  }

  console.log(
    `[provenance-backfill] ${dryRun ? "Would update" : "Updated"} ${updated} rows.`,
  );
  if (Object.keys(sourceCounts).length > 0) {
    console.log(
      `  Source breakdown: ${Object.entries(sourceCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    );
  }
  await getPool().end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await getPool().end();
  } catch {}
  process.exit(1);
});
