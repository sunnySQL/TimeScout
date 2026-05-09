/**
 * Ingest Chrono24 listings into `listings` using the Retailed search API.
 *
 * We store `priceCents` as minor units of `currency` (e.g. US cents, eurocents).
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { listings, sources } from "../../db/schema";
import {
  fetchChrono24SearchPage,
  type RetailedChrono24Item,
} from "../chrono24/retailedSearch";
import { parseWatch } from "../watches/parse";

export const CHRONO24_SOURCE_SLUG = "chrono24";

export type IngestChrono24Options = {
  apiKey: string;
  baseUrl?: string;
  query: string;
  /** Pages to walk (each page = one Retailed request). */
  pages?: number;
  pageSize?: 30 | 60 | 120;
  currency?: string;
};

export type IngestChrono24Result = {
  upserted: number;
  pagesFetched: number;
  elapsedMs: number;
};

function symbolToCurrency(symbol: string): string {
  const s = symbol.trim();
  if (s === "€" || s === "EUR") return "EUR";
  if (s === "$" || s === "USD" || s === "US$") return "USD";
  if (s === "£" || s === "GBP") return "GBP";
  if (s === "¥" || s === "JPY") return "JPY";
  if (/^[A-Z]{3}$/.test(s)) return s;
  return "USD";
}

/** Major units → minor units (2-decimal currencies ×100; JPY ×1). */
function majorToMinor(amount: number, currency: string): number {
  if (currency === "JPY") return Math.round(amount);
  return Math.round(amount * 100);
}

export async function ensureChrono24Source(): Promise<number> {
  const db = getDb();
  await db
    .insert(sources)
    .values({
      slug: CHRONO24_SOURCE_SLUG,
      name: "Chrono24",
      baseUrl: "https://www.chrono24.com",
      isActive: true,
    })
    .onDuplicateKeyUpdate({
      set: { name: sql`VALUES(name)` },
    });

  const [row] = await db
    .select()
    .from(sources)
    .where(eq(sources.slug, CHRONO24_SOURCE_SLUG));

  if (!row) throw new Error("Failed to create or fetch Chrono24 source");
  return row.id;
}

async function upsertItems(sourceId: number, items: RetailedChrono24Item[]) {
  const db = getDb();
  let count = 0;

  for (const it of items) {
    if (!it.id || !it.url || !it.title) continue;
    const p = it.price;
    const currency = p ? symbolToCurrency(p.currency) : "USD";
    const priceCents =
      p != null && Number.isFinite(p.amount) ? majorToMinor(p.amount, currency) : null;

    const titleForParse = [it.title, it.subtitle].filter(Boolean).join(" ");
    const parsed = parseWatch(titleForParse);

    const region =
      it.location && /^[A-Z]{2}$/.test(it.location.trim()) ? it.location.trim() : null;

    await db
      .insert(listings)
      .values({
        sourceId,
        externalId: it.id,
        title: it.title.slice(0, 512),
        brandRaw: null,
        modelRaw: null,
        referenceRaw: null,
        brand: parsed.brand,
        reference: parsed.reference,
        priceCents: priceCents ?? undefined,
        currency,
        condition: null,
        listingUrl: it.url.slice(0, 2048),
        imageUrl: it.images?.[0]?.slice(0, 2048) ?? null,
        region,
      })
      .onDuplicateKeyUpdate({
        set: {
          title: sql`VALUES(title)`,
          brand: sql`VALUES(brand)`,
          reference: sql`VALUES(reference)`,
          priceCents: sql`VALUES(price_cents)`,
          currency: sql`VALUES(currency)`,
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

export async function ingestChrono24(
  options: IngestChrono24Options,
): Promise<IngestChrono24Result> {
  const started = Date.now();
  const pages = Math.max(1, Math.min(50, options.pages ?? 3));
  const pageSize = options.pageSize ?? 60;

  const sourceId = await ensureChrono24Source();
  let upserted = 0;
  let pagesFetched = 0;

  for (let page = 1; page <= pages; page++) {
    const body = await fetchChrono24SearchPage({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      query: options.query,
      page,
      pageSize,
      currency: options.currency ?? "USD",
    });

    const batch = body.results ?? [];
    pagesFetched++;
    upserted += await upsertItems(sourceId, batch);

    const hasNext = body.pagination?.has_next_page === true;
    if (!hasNext || batch.length === 0) break;
  }

  return {
    upserted,
    pagesFetched,
    elapsedMs: Date.now() - started,
  };
}
