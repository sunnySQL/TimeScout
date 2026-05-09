/**
 * CLI wrapper around `lib/ingest/reddit.ts`.
 *
 * Runs two phases back-to-back so a single command gets you the same
 * coverage as the scheduled production jobs:
 *
 *   1. ingestReddit  – walks /new (pages 1-3) and upserts every WTS post.
 *                      Also does OP-comment rescue for posts with no price.
 *   2. rescuePrices  – scans the DB for rows in the last 72h still missing a
 *                      price and/or parsed brand, then re-fetches each thread.
 *                      Catches posts that aged off /new but are still unresolved.
 *
 * Usage:
 *   npm run ingest:reddit
 *   npm run ingest:reddit -- --pages 5
 *   npm run ingest:reddit -- --no-comments          # skip OP-comment work (fast)
 *   npm run ingest:reddit -- --no-rescue             # skip the DB rescue phase
 *   npm run ingest:reddit -- --rescue-only           # skip the /new walk
 *   npm run ingest:reddit -- --rescue-only --window 720  # rescue past 30 days
 *   npm run ingest:reddit -- --ai                    # AI-classify rows that regex missed
 *   npm run ingest:reddit -- --ai --ai-max 50        # cap AI calls (default 200)
 *   npm run ingest:reddit -- --debug                 # chattier output
 */

import "dotenv/config";
import { ingestReddit, rescuePrices } from "../../lib/ingest/reddit";
import { getPool } from "../../db";

type Args = {
  pages: number;
  fetchComments: boolean;
  runIngest: boolean;
  runRescue: boolean;
  rescueWindowHours: number;
  rescueLimit: number;
  useLocal: boolean;
  useAi: boolean;
  aiMaxCalls: number;
  debug: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let pages = 3;
  let fetchComments = true;
  let runIngest = true;
  let runRescue = true;
  let rescueWindowHours = 72;
  let rescueLimit = 50;
  let useLocal = true;
  let useAi = false;
  let aiMaxCalls = 200;
  let debug = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--pages" && next) {
      pages = Math.max(1, Math.min(10, Number(next) || 1));
      i++;
    } else if (a === "--window" && next) {
      rescueWindowHours = Math.max(1, Number(next) || 72);
      i++;
    } else if (a === "--limit" && next) {
      rescueLimit = Math.max(1, Number(next) || 50);
      i++;
    } else if (a === "--ai-max" && next) {
      aiMaxCalls = Math.max(1, Number(next) || 200);
      i++;
    } else if (a === "--no-comments") {
      fetchComments = false;
    } else if (a === "--no-rescue") {
      runRescue = false;
    } else if (a === "--rescue-only") {
      runIngest = false;
      runRescue = true;
    } else if (a === "--no-local") {
      useLocal = false;
    } else if (a === "--ai") {
      useAi = true;
    } else if (a === "--debug") {
      debug = true;
    }
  }
  return {
    pages,
    fetchComments,
    runIngest,
    runRescue,
    rescueWindowHours,
    rescueLimit,
    useLocal,
    useAi,
    aiMaxCalls,
    debug,
  };
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

async function main() {
  const args = parseArgs();

  if (args.runIngest) {
    console.log(
      `[ingest] r/Watchexchange (pages=${args.pages}, comments=${args.fetchComments}, local=${args.useLocal}, ai=${args.useAi})…`,
    );
    const result = await ingestReddit({
      subreddit: "Watchexchange",
      pages: args.pages,
      fetchComments: args.fetchComments,
      useLocal: args.useLocal,
      useAi: args.useAi,
      aiMaxCalls: args.aiMaxCalls,
    });

    console.log(
      `[ingest] done in ${(result.elapsedMs / 1000).toFixed(1)}s.\n` +
        `  Fetched: ${result.fetched} posts (${result.wts} WTS)\n` +
        `  Upserted: ${result.upserted}\n` +
        `  Priced from title/body : ${result.pricedFromTitleBody} (${pct(result.pricedFromTitleBody, result.upserted)})\n` +
        `  Priced after comments  : ${result.pricedAfterComments} (${pct(result.pricedAfterComments, result.upserted)})\n` +
        `  Brand parsed           : ${result.brandParsed} (${pct(result.brandParsed, result.upserted)})\n` +
        `  Comment fetches        : ${result.commentFetchesAttempted}` +
        (args.useLocal
          ? `\n  Local ML calls/labeled : ${result.localCalls} / ${result.localLabeled}`
          : "") +
        (args.useAi
          ? `\n  AI calls / labeled     : ${result.aiCalls} / ${result.aiLabeled}`
          : ""),
    );
  }

  if (args.runRescue) {
    console.log(
      `\n[rescue] scanning DB for incomplete rows in the last ${args.rescueWindowHours}h…`,
    );
    const r = await rescuePrices({ windowHours: args.rescueWindowHours, limit: args.rescueLimit });
    console.log(
      `[rescue] done in ${(r.elapsedMs / 1000).toFixed(1)}s.\n` +
        `  Candidates   : ${r.candidates}\n` +
        `  Attempted    : ${r.attempted}\n` +
        `  Rescued price: ${r.rescued}\n` +
        `  Marked sold  : ${r.markedSold}`,
    );
  }

  if (args.debug) {
    console.log("\n(Tip: to inspect rows, use `npm run db:studio`.)");
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
