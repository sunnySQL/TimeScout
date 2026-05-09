/**
 * Fetch OP comments for ALL recent listings missing condition/price/brand.
 * Loops in batches of 200 with automatic pauses between batches to respect
 * Reddit rate limits. Just kick it off and walk away.
 *
 * Usage:
 *   npm run rescue:all
 *   npm run rescue:all -- --window 336     # 14 days instead of default 7
 *   npm run rescue:all -- --batch 100      # smaller batches
 */

import "dotenv/config";
import { rescuePrices } from "../lib/ingest/reddit";
import { getPool } from "../db";

type Args = {
  windowHours: number;
  batchSize: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let windowHours = 168; // 7 days
  let batchSize = 200;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--window" && next) {
      windowHours = Math.max(1, Number(next) || 168);
      i++;
    } else if (a === "--batch" && next) {
      batchSize = Math.max(10, Math.min(500, Number(next) || 200));
      i++;
    }
  }
  return { windowHours, batchSize };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs();
  const overallStart = Date.now();
  let totalAttempted = 0;
  let totalRescued = 0;
  let totalSold = 0;
  let round = 0;

  console.log(
    `[rescue-all] Starting continuous rescue (window=${args.windowHours}h, batch=${args.batchSize})`,
  );
  console.log(`[rescue-all] Press Ctrl+C to stop at any time.\n`);

  while (true) {
    round++;
    console.log(`── Round ${round} ──`);

    const result = await rescuePrices({
      windowHours: args.windowHours,
      limit: args.batchSize,
      delayMs: 1200,
    });

    totalAttempted += result.attempted;
    totalRescued += result.rescued;
    totalSold += result.markedSold;

    console.log(
      `  Attempted: ${result.attempted}, rescued price: ${result.rescued},` +
        ` marked sold: ${result.markedSold} (${(result.elapsedMs / 1000).toFixed(0)}s)`,
    );

    if (result.attempted === 0) {
      console.log(`\n[rescue-all] No more candidates. All done.`);
      break;
    }

    if (result.attempted < args.batchSize) {
      console.log(`\n[rescue-all] Last batch was partial — all candidates processed.`);
      break;
    }

    // Brief pause between batches to be kind to Reddit
    console.log(`  Pausing 10s before next batch…\n`);
    await sleep(10_000);
  }

  const elapsed = ((Date.now() - overallStart) / 1000 / 60).toFixed(1);
  console.log(
    `\n[rescue-all] Finished in ${elapsed} min.\n` +
      `  Total attempted : ${totalAttempted}\n` +
      `  Total rescued   : ${totalRescued}\n` +
      `  Total marked sold: ${totalSold}\n` +
      `  Rounds          : ${round}`,
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
