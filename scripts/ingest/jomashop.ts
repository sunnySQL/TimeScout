/**
 * Ingest Jomashop (or CJ-style) product catalog from a local TSV/CSV file.
 *
 *   npm run ingest:jomashop -- --file ./data/jomashop-feed.txt
 *
 * Obtain a feed after joining the Jomashop affiliate program (Commission Junction)
 * — see https://help.jomashop.com/hc/en-us/articles/11923106976027-Affiliate-Program
 */

import "dotenv/config";
import { getPool } from "../../db";
import { ingestJomashopFromFile } from "../../lib/ingest/jomashop";

function parseArgs(): { filePath: string } {
  const argv = process.argv.slice(2);
  let filePath = process.env.JOMASHOP_FEED_PATH?.trim() ?? "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if ((a === "--file" || a === "-f") && next) {
      filePath = next;
      i++;
    }
  }
  return { filePath };
}

async function main() {
  const { filePath } = parseArgs();
  if (!filePath) {
    console.error(
      "Usage: npm run ingest:jomashop -- --file /path/to/feed.txt\n" +
        "Or set JOMASHOP_FEED_PATH in .env",
    );
    process.exit(1);
  }

  console.log(`Ingesting Jomashop catalog from ${filePath}`);
  const r = await ingestJomashopFromFile({ filePath });
  console.log(
    `Done in ${(r.elapsedMs / 1000).toFixed(1)}s — rows=${r.rowsRead}, upserted=${r.upserted}, skipped=${r.skipped}`,
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
