/**
 * Ingest Chrono24 listings via Retailed (Chrono24.com is not machine-fetchable
 * with a simple HTTP client — Cloudflare challenge).
 *
 *   RETAILED_API_KEY=... npm run ingest:chrono24 -- --query "Omega Speedmaster" --pages 2
 *
 * Get a key: https://app.retailed.io/login → API Keys (usage is metered).
 */

import "dotenv/config";
import { getPool } from "../../db";
import { ingestChrono24 } from "../../lib/ingest/chrono24";

function parseArgs(): {
  query: string;
  pages: number;
  pageSize: 30 | 60 | 120;
} {
  const argv = process.argv.slice(2);
  let query = "";
  let pages = 3;
  let pageSize: 30 | 60 | 120 = 60;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--query" && next) {
      query = next;
      i++;
    } else if (a === "--pages" && next) {
      pages = Math.max(1, Math.min(50, Number(next) || 1));
      i++;
    } else if (a === "--page-size" && next) {
      const n = Number(next);
      if (n === 30 || n === 60 || n === 120) pageSize = n;
      i++;
    }
  }
  return { query, pages, pageSize };
}

async function main() {
  const apiKey = process.env.RETAILED_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "Missing RETAILED_API_KEY. Create a token at https://app.retailed.io/login (API Keys).",
    );
    process.exit(1);
  }

  const { query, pages, pageSize } = parseArgs();
  if (!query) {
    console.error('Usage: npm run ingest:chrono24 -- --query "Rolex Submariner" [--pages 3] [--page-size 60]');
    process.exit(1);
  }

  console.log(`Ingesting Chrono24 (Retailed): query=${JSON.stringify(query)}, pages=${pages}, pageSize=${pageSize}`);
  const r = await ingestChrono24({
    apiKey,
    query,
    pages,
    pageSize,
  });
  console.log(
    `Done in ${(r.elapsedMs / 1000).toFixed(1)}s — upserted ${r.upserted} rows across ${r.pagesFetched} page(s).`,
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
