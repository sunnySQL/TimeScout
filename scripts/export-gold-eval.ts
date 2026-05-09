/**
 * Export human-approved gold eval rows with listing text for offline scoring.
 *
 * Writes ml/data/gold_eval.csv (header row always present).
 *
 * Usage:
 *   npm run export:gold-eval
 */

import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { listingGoldEval, listings, sources } from "@/db/schema";

const HEADERS = [
  "listing_id",
  "title",
  "description",
  "listing_url",
  "source_name",
  "brand",
  "reference",
  "condition",
  "watch_type",
  "price_cents",
  "price_min_cents",
  "price_max_cents",
  "is_bundle",
  "is_sold",
  "notes",
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtBool(v: boolean | null): string {
  if (v === null || v === undefined) return "";
  return v ? "true" : "false";
}

async function main() {
  const db = getDb();

  const rows = await db
    .select({
      listing_id: listingGoldEval.listingId,
      title: listings.title,
      description: listings.description,
      listing_url: listings.listingUrl,
      source_name: sources.name,
      brand: listingGoldEval.brand,
      reference: listingGoldEval.reference,
      condition: listingGoldEval.condition,
      watch_type: listingGoldEval.watchType,
      price_cents: listingGoldEval.priceCents,
      price_min_cents: listingGoldEval.priceMinCents,
      price_max_cents: listingGoldEval.priceMaxCents,
      is_bundle: listingGoldEval.isBundle,
      is_sold: listingGoldEval.isSold,
      notes: listingGoldEval.notes,
    })
    .from(listingGoldEval)
    .innerJoin(listings, eq(listings.id, listingGoldEval.listingId))
    .innerJoin(sources, eq(sources.id, listings.sourceId));

  const outDir = path.join(process.cwd(), "ml", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "gold_eval.csv");

  const lines: string[] = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.listing_id),
        csvEscape(r.title),
        csvEscape(r.description),
        csvEscape(r.listing_url),
        csvEscape(r.source_name),
        csvEscape(r.brand),
        csvEscape(r.reference),
        csvEscape(r.condition),
        csvEscape(r.watch_type),
        csvEscape(r.price_cents ?? ""),
        csvEscape(r.price_min_cents ?? ""),
        csvEscape(r.price_max_cents ?? ""),
        csvEscape(fmtBool(r.is_bundle)),
        csvEscape(fmtBool(r.is_sold)),
        csvEscape(r.notes),
      ].join(","),
    );
  }

  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`[export-gold-eval] wrote ${rows.length} row(s) → ${outPath}`);
}

main()
  .catch((err) => {
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
