/**
 * Ingest wristwatch listings from eBay US Browse API into `listings`.
 *
 * Usage:
 *   npm run ingest:ebay -- --query "rolex submariner" --pages 3
 *
 * Upserts on the unique (source_id, external_id) index and bumps `last_seen_at`.
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb, getPool } from "../../db";
import { listings, sources } from "../../db/schema";
import {
  browseSearch,
  normalizeEbayCondition,
  WRISTWATCHES_CATEGORY_ID,
  type EbayItemSummary,
} from "../../lib/ebay/browse";
import { parseWatch } from "../../lib/watches/parse";

const EBAY_SOURCE_SLUG = "ebay";
const MAX_PAGE_SIZE = 200;

type Args = {
  query: string;
  pages: number;
  limit: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let query = "";
  let pages = 2;
  let limit = 50;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--query" && next) {
      query = next;
      i++;
    } else if (a === "--pages" && next) {
      pages = Math.max(1, Math.min(20, Number(next) || 1));
      i++;
    } else if (a === "--limit" && next) {
      limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(next) || 50));
      i++;
    }
  }
  return { query, pages, limit };
}

async function ensureEbaySource(): Promise<number> {
  const db = getDb();
  await db
    .insert(sources)
    .values({
      slug: EBAY_SOURCE_SLUG,
      name: "eBay",
      baseUrl: "https://www.ebay.com",
      isActive: true,
    })
    .onDuplicateKeyUpdate({
      set: { name: sql`VALUES(name)` },
    });

  const [row] = await db
    .select()
    .from(sources)
    .where(sql`slug = ${EBAY_SOURCE_SLUG}`);

  if (!row) throw new Error("Failed to create or fetch eBay source");
  return row.id;
}

function parsePriceToCents(value?: string): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function parseUsState(item: EbayItemSummary): string | null {
  const loc = item.itemLocation;
  if (!loc || loc.country !== "US") return null;
  const s = loc.stateOrProvince?.trim();
  if (!s) return null;
  if (/^[A-Z]{2}$/.test(s)) return s;
  return null;
}

async function upsertItems(sourceId: number, items: EbayItemSummary[]) {
  if (items.length === 0) return 0;
  const db = getDb();

  let count = 0;
  for (const it of items) {
    const priceCents = parsePriceToCents(it.price?.value);
    if (!it.itemId || !it.title || !it.itemWebUrl) continue;

    const parsed = parseWatch(it.title);
    await db
      .insert(listings)
      .values({
        sourceId,
        externalId: it.itemId,
        title: it.title.slice(0, 512),
        brandRaw: null,
        modelRaw: null,
        referenceRaw: null,
        brand: parsed.brand,
        reference: parsed.reference,
        priceCents: priceCents ?? undefined,
        currency: it.price?.currency ?? "USD",
        condition: normalizeEbayCondition(it.conditionId, it.condition),
        listingUrl: it.itemWebUrl.slice(0, 2048),
        imageUrl:
          it.image?.imageUrl?.slice(0, 2048) ??
          it.thumbnailImages?.[0]?.imageUrl?.slice(0, 2048) ??
          null,
        region: parseUsState(it),
      })
      .onDuplicateKeyUpdate({
        set: {
          title: sql`VALUES(title)`,
          brand: sql`VALUES(brand)`,
          reference: sql`VALUES(reference)`,
          priceCents: sql`VALUES(price_cents)`,
          currency: sql`VALUES(currency)`,
          condition: sql`VALUES(\`condition\`)`,
          listingUrl: sql`VALUES(listing_url)`,
          imageUrl: sql`VALUES(image_url)`,
          region: sql`VALUES(region)`,
          lastSeenAt: sql`CURRENT_TIMESTAMP`,
        },
      });
    count++;
  }
  return count;
}

async function main() {
  const { query, pages, limit } = parseArgs();
  const sourceId = await ensureEbaySource();

  console.log(
    `Ingesting eBay US wristwatches: query=${JSON.stringify(query || "(none)")}, pages=${pages}, limit=${limit}`,
  );

  let total = 0;
  for (let page = 0; page < pages; page++) {
    const offset = page * limit;
    const res = await browseSearch({
      q: query || undefined,
      categoryId: WRISTWATCHES_CATEGORY_ID,
      limit,
      offset,
    });
    const items = res.itemSummaries ?? [];
    const n = await upsertItems(sourceId, items);
    total += n;
    console.log(
      `  page ${page + 1}/${pages}: fetched ${items.length}, upserted ${n} (reported total=${res.total ?? "?"})`,
    );
    if (items.length < limit) break;
  }

  console.log(`Done. Upserted ${total} listings from eBay.`);
  await getPool().end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await getPool().end();
  } catch {}
  process.exit(1);
});
