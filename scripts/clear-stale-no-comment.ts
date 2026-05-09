/**
 * Clear Reddit rescue sentinel descriptions so `rescuePrices` can retry a fetch.
 *
 * Rescue only selects rows where description IS NULL or ''; rows stuck on
 * "[no comment]" (thread had no usable body at fetch time) never re-enter the
 * queue even when title/flair already filled price — this sets description to
 * NULL for recent rows so the next rescue pass can re-fetch OP/submission text.
 *
 * Does not modify listing_label_reviews or other columns.
 *
 * Usage:
 *   npm run clear:stale-no-comment -- --dry-run
 *   npm run clear:stale-no-comment -- --dry-run --window 336 --limit 200
 *   npm run clear:stale-no-comment -- --window 336 --limit 50
 */

import "dotenv/config";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, getPool } from "../db";
import { listings } from "../db/schema";

const NO_COMMENT = "[no comment]";

type Args = {
  dryRun: boolean;
  windowHours: number;
  limit: number | undefined;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let dryRun = false;
  let windowHours = 336;
  let limit: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--window" && next) {
      windowHours = Math.max(1, Math.floor(Number(next)) || 336);
      i++;
    } else if (a === "--limit" && next) {
      limit = Math.max(1, Math.floor(Number(next)) || 1);
      i++;
    }
  }
  return { dryRun, windowHours, limit };
}

async function main() {
  const { dryRun, windowHours, limit } = parseArgs();
  const db = getDb();
  const hoursInt = Math.floor(windowHours);

  const whereClause = and(
    eq(listings.description, NO_COMMENT),
    sql`${listings.firstSeenAt} >= (NOW() - INTERVAL ${sql.raw(String(hoursInt))} HOUR)`,
  );

  const q = db
    .select({ id: listings.id })
    .from(listings)
    .where(whereClause)
    .orderBy(desc(listings.firstSeenAt));

  const rows = limit != null ? await q.limit(limit) : await q;

  console.log(
    `[clear-stale-no-comment] matched ${rows.length} row(s) ` +
      `(description='${NO_COMMENT}', first_seen within ${windowHours}h` +
      (limit != null ? `, limit ${limit}` : "") +
      ") ",
  );

  if (rows.length === 0) return;

  const ids = rows.map((r) => r.id);
  if (dryRun) {
    console.log("[clear-stale-no-comment] dry-run: would set description = NULL for listing id(s):");
    console.log(ids.join(", "));
    return;
  }

  await db.update(listings).set({ description: null }).where(inArray(listings.id, ids));
  console.log(`[clear-stale-no-comment] updated ${ids.length} row(s). Run rescue (e.g. npm run rescue:all) to re-fetch bodies.`);
}

main()
  .catch(async (err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPool().end();
    } catch {
      /* ignore */
    }
  });
