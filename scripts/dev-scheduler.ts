/**
 * Local development scheduler.
 *
 * Runs the same work Vercel Cron runs in production, but against your local
 * dev database. Useful if you want fresh data flowing while you work on the
 * UI without remembering to run `npm run ingest:reddit` by hand.
 *
 * Usage:
 *   npm run dev:scheduler
 *
 * Leaves two loops running:
 *   - Fast ingest:          every 15 minutes
 *   - Price rescue (OP):    every 60 minutes (batches of 40)
 *
 * Hit Ctrl+C to stop.
 */

import "dotenv/config";
import { rescuePrices } from "../lib/ingest/reddit";
import { runScheduledIngest } from "../lib/cron/scheduledIngest";

const INGEST_EVERY_MS = 15 * 60 * 1000;
const RESCUE_EVERY_MS = 60 * 60 * 1000;
const RESCUE_BATCH = 40;

async function runIngest() {
  const label = "[ingest]";
  console.log(`${label} starting at ${new Date().toISOString()}`);
  try {
    const { reddit: r, chrono24, jomashop } = await runScheduledIngest();
    console.log(
      `${label} reddit upserted=${r.upserted} priced=${r.pricedFromTitleBody} brand=${r.brandParsed} in ${(r.elapsedMs / 1000).toFixed(1)}s`,
    );
    if ("reason" in chrono24) {
      console.log(`${label} chrono24 skipped: ${chrono24.reason}`);
    } else {
      console.log(
        `${label} chrono24 upserted=${chrono24.upserted} pages=${chrono24.pagesFetched} in ${(chrono24.elapsedMs / 1000).toFixed(1)}s`,
      );
    }
    if ("reason" in jomashop) {
      console.log(`${label} jomashop skipped: ${jomashop.reason}`);
    } else {
      console.log(
        `${label} jomashop rows=${jomashop.rowsRead} upserted=${jomashop.upserted} skipped=${jomashop.skipped} in ${(jomashop.elapsedMs / 1000).toFixed(1)}s`,
      );
    }
  } catch (err) {
    console.error(`${label} failed:`, err);
  }
}

async function runRescue() {
  const label = "[rescue]";
  console.log(`${label} starting at ${new Date().toISOString()}`);
  try {
    const r = await rescuePrices({ limit: RESCUE_BATCH });
    console.log(
      `${label} rescued=${r.rescued}/${r.attempted} (of ${r.candidates} candidates) in ${(r.elapsedMs / 1000).toFixed(1)}s`,
    );
  } catch (err) {
    console.error(`${label} failed:`, err);
  }
}

async function main() {
  console.log("Dev scheduler starting. Ctrl+C to stop.");
  console.log(
    `  ingest every ${INGEST_EVERY_MS / 60000}m, rescue every ${RESCUE_EVERY_MS / 60000}m.`,
  );

  // Run once on startup so you have fresh data immediately.
  await runIngest();
  await runRescue();

  setInterval(runIngest, INGEST_EVERY_MS);
  setInterval(runRescue, RESCUE_EVERY_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
