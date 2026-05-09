/**
 * Ingest Jomashop (or compatible) product rows from a **tab- or comma-separated**
 * catalog file — the path most affiliates get after joining Commission Junction
 * (Jomashop documents a product feed for publishers).
 *
 * Supported headers (case-insensitive; first match wins):
 * - Link: `LINK`, `BUY_URL`, `PRODUCT_URL`, `URL`
 * - Id: `SKU`, `ID`, `PROGRAM_SKU`
 * - Title: `TITLE`, `NAME`, `PRODUCT_NAME`
 * - Price: `PRICE`, `SALE_PRICE`, `BUY_PRICE`, `CURRENT_PRICE`
 * - Image: `IMAGE_LINK`, `IMAGE_URL`, `IMAGE`, `PRIMARY_IMAGE`
 */

import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { listings, sources } from "../../db/schema";
import { parseWatch } from "../watches/parse";

export const JOMASHOP_SOURCE_SLUG = "jomashop";

const LINK_KEYS = [
  "link",
  "buy_url",
  "product_url",
  "program_url",
  "destination_url",
  "url",
];
const ID_KEYS = ["sku", "id", "program_sku", "product_id"];
const TITLE_KEYS = ["title", "name", "product_name", "product title"];
const PRICE_KEYS = ["price", "sale_price", "buy_price", "current_price", "sale price"];
const IMAGE_KEYS = ["image_link", "image_url", "image", "primary_image", "large image"];

export type IngestJomashopOptions = {
  /** Absolute or cwd-relative path to .csv / .txt feed export. */
  filePath: string;
};

export type IngestJomashopFromUrlOptions = {
  /** HTTPS URL to a tab- or comma-separated CJ-style product feed. */
  url: string;
  /** Optional fetch timeout in ms (default 120_000). */
  fetchTimeoutMs?: number;
};

export type IngestJomashopResult = {
  rowsRead: number;
  upserted: number;
  skipped: number;
  elapsedMs: number;
};

export async function ensureJomashopSource(): Promise<number> {
  const db = getDb();
  await db
    .insert(sources)
    .values({
      slug: JOMASHOP_SOURCE_SLUG,
      name: "Jomashop",
      baseUrl: "https://www.jomashop.com",
      isActive: true,
    })
    .onDuplicateKeyUpdate({
      set: { name: sql`VALUES(name)` },
    });

  const [row] = await db
    .select()
    .from(sources)
    .where(eq(sources.slug, JOMASHOP_SOURCE_SLUG));

  if (!row) throw new Error("Failed to create or fetch Jomashop source");
  return row.id;
}

function sniffDelimiter(headerLine: string): "\t" | "," {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return tabs >= commas ? "\t" : ",";
}

function parseDelimited(content: string, delim: "\t" | ","): string[][] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const rows: string[][] = [];
  for (const line of lines) {
    if (delim === "\t") {
      rows.push(line.split("\t"));
    } else {
      rows.push(parseCsvLine(line));
    }
  }
  return rows;
}

/** Minimal CSV line parser — handles quoted fields with commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function pickColumn(
  headers: string[],
  row: string[],
  candidates: string[],
): string | null {
  const idx = headers.findIndex((h) => candidates.includes(h));
  if (idx < 0 || idx >= row.length) return null;
  const v = row[idx]?.trim();
  return v && v.length > 0 ? v : null;
}

function parseUsdPriceToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$€£,\s]/g, "").replace(/USD|EUR|GBP/gi, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

async function upsertRows(
  sourceId: number,
  rows: string[][],
  headersRaw: string[],
): Promise<{ upserted: number; skipped: number }> {
  const headers = headersRaw.map(normalizeHeader);
  const db = getDb();
  let upserted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.length < headers.length) {
      skipped++;
      continue;
    }

    const link = pickColumn(headers, row, LINK_KEYS);
    const title = pickColumn(headers, row, TITLE_KEYS);
    if (!link || !title) {
      skipped++;
      continue;
    }

    let externalId = pickColumn(headers, row, ID_KEYS);
    if (!externalId) {
      try {
        const u = new URL(link);
        const last = u.pathname.split("/").filter(Boolean).pop() ?? link;
        externalId = last.slice(0, 191);
      } catch {
        externalId = link.slice(0, 191);
      }
    }

    const priceRaw = pickColumn(headers, row, PRICE_KEYS);
    const priceCents = priceRaw ? parseUsdPriceToCents(priceRaw) : null;
    const imageUrl = pickColumn(headers, row, IMAGE_KEYS);

    const parsed = parseWatch(title);

    await db
      .insert(listings)
      .values({
        sourceId,
        externalId: externalId.slice(0, 191),
        title: title.slice(0, 512),
        brandRaw: null,
        modelRaw: null,
        referenceRaw: null,
        brand: parsed.brand,
        reference: parsed.reference,
        priceCents: priceCents ?? undefined,
        currency: "USD",
        condition: null,
        listingUrl: link.slice(0, 2048),
        imageUrl: imageUrl ? imageUrl.slice(0, 2048) : null,
        region: null,
      })
      .onDuplicateKeyUpdate({
        set: {
          title: sql`VALUES(title)`,
          brand: sql`VALUES(brand)`,
          reference: sql`VALUES(reference)`,
          priceCents: sql`VALUES(price_cents)`,
          listingUrl: sql`VALUES(listing_url)`,
          imageUrl: sql`VALUES(image_url)`,
          lastSeenAt: sql`CURRENT_TIMESTAMP`,
        },
      });
    upserted++;
  }

  return { upserted, skipped };
}

/**
 * Parse a CJ-style delimited export that is already in memory (used by
 * {@link ingestJomashopFromFile} and {@link ingestJomashopFromUrl}).
 */
export async function ingestJomashopFromText(raw: string): Promise<IngestJomashopResult> {
  const started = Date.now();
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const delim = sniffDelimiter(firstLine);
  const table = parseDelimited(raw, delim);
  if (table.length < 2) {
    return { rowsRead: 0, upserted: 0, skipped: 0, elapsedMs: Date.now() - started };
  }

  const headersRaw = table[0].map((h) => h.trim());
  const body = table.slice(1);
  const sourceId = await ensureJomashopSource();
  const { upserted, skipped } = await upsertRows(sourceId, body, headersRaw);

  return {
    rowsRead: body.length,
    upserted,
    skipped,
    elapsedMs: Date.now() - started,
  };
}

export async function ingestJomashopFromFile(
  options: IngestJomashopOptions,
): Promise<IngestJomashopResult> {
  const raw = await readFile(options.filePath, "utf8");
  return ingestJomashopFromText(raw);
}

/** Fetch a remote feed (e.g. CJ presigned URL) and upsert like {@link ingestJomashopFromFile}. */
export async function ingestJomashopFromUrl(
  options: IngestJomashopFromUrlOptions,
): Promise<IngestJomashopResult> {
  const ms = options.fetchTimeoutMs ?? 120_000;
  const res = await fetch(options.url, {
    signal: AbortSignal.timeout(ms),
    headers: {
      "User-Agent":
        process.env.JOMASHOP_FEED_FETCH_UA?.trim() || "TimeScout/1.0 (scheduled feed ingest)",
    },
  });
  if (!res.ok) {
    throw new Error(`Jomashop feed HTTP ${res.status} ${res.statusText}`);
  }
  const raw = await res.text();
  return ingestJomashopFromText(raw);
}
