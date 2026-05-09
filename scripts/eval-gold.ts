/**
 * Compare current live `listings` values against frozen `listing_gold_eval` rows.
 *
 * Usage:
 *   npm run eval:gold
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { listingGoldEval, listings } from "@/db/schema";

type EvalField =
  | "brand"
  | "reference"
  | "condition"
  | "watch_type"
  | "price"
  | "is_bundle"
  | "is_sold";

type FailRow = {
  listingId: number;
  title: string | null;
  expected: string;
  actual: string;
};

function sqlBool(v: unknown): boolean {
  return v === true || v === 1;
}

function cents(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normLabel(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

function labelsEq(a: string | null | undefined, b: string | null | undefined): boolean {
  return normLabel(a) === normLabel(b);
}

function pricesBlank(c: number | null, mn: number | null, mx: number | null): boolean {
  return c == null && mn == null && mx == null;
}

function priceRepr(p: { c: number | null; min: number | null; max: number | null }): string {
  if (pricesBlank(p.c, p.min, p.max)) return "(blank)";
  if (p.c != null) return `${p.c} cents`;
  return `min=${p.min ?? "(null)"} max=${p.max ?? "(null)"}`;
}

function priceMatches(
  live: { c: number | null; min: number | null; max: number | null },
  gold: { c: number | null; min: number | null; max: number | null },
): boolean {
  if (pricesBlank(gold.c, gold.min, gold.max)) {
    return pricesBlank(live.c, live.min, live.max);
  }
  if (gold.c != null) {
    return live.c === gold.c;
  }
  if (gold.min != null || gold.max != null) {
    return live.min === gold.min && live.max === gold.max;
  }
  return false;
}

function fmtScalar(v: unknown): string {
  if (v === null || v === undefined) return "(null)";
  return String(v);
}

function bundleSoldEq(live: unknown, gold: unknown): boolean {
  return sqlBool(live) === sqlBool(gold ?? false);
}

async function main() {
  const db = getDb();
  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      lb: listings.brand,
      lr: listings.reference,
      lc: listings.condition,
      lw: listings.watchType,
      lpc: listings.priceCents,
      lpm: listings.priceMinCents,
      lpx: listings.priceMaxCents,
      lib: listings.isBundle,
      lis: listings.isSold,
      gb: listingGoldEval.brand,
      gr: listingGoldEval.reference,
      gc: listingGoldEval.condition,
      gw: listingGoldEval.watchType,
      gpc: listingGoldEval.priceCents,
      gpm: listingGoldEval.priceMinCents,
      gpx: listingGoldEval.priceMaxCents,
      gib: listingGoldEval.isBundle,
      gis: listingGoldEval.isSold,
    })
    .from(listingGoldEval)
    .innerJoin(listings, eq(listings.id, listingGoldEval.listingId));

  const n = rows.length;
  console.log(`Gold eval scoring — ${n} row(s)\n`);

  if (n === 0) {
    console.log("No listing_gold_eval rows.");
    return;
  }

  const ok: Record<EvalField, number> = {
    brand: 0,
    reference: 0,
    condition: 0,
    watch_type: 0,
    price: 0,
    is_bundle: 0,
    is_sold: 0,
  };

  const failures: Record<EvalField, FailRow[]> = {
    brand: [],
    reference: [],
    condition: [],
    watch_type: [],
    price: [],
    is_bundle: [],
    is_sold: [],
  };

  for (const r of rows) {
    const livePrice = {
      c: cents(r.lpc),
      min: cents(r.lpm),
      max: cents(r.lpx),
    };
    const goldPrice = {
      c: cents(r.gpc),
      min: cents(r.gpm),
      max: cents(r.gpx),
    };

    const checks: Array<{ field: EvalField; pass: boolean; expected: string; actual: string }> =
      [
        {
          field: "brand",
          pass: labelsEq(r.lb, r.gb),
          expected: fmtScalar(r.gb),
          actual: fmtScalar(r.lb),
        },
        {
          field: "reference",
          pass: labelsEq(r.lr, r.gr),
          expected: fmtScalar(r.gr),
          actual: fmtScalar(r.lr),
        },
        {
          field: "condition",
          pass: labelsEq(r.lc, r.gc),
          expected: fmtScalar(r.gc),
          actual: fmtScalar(r.lc),
        },
        {
          field: "watch_type",
          pass: labelsEq(r.lw, r.gw),
          expected: fmtScalar(r.gw),
          actual: fmtScalar(r.lw),
        },
        {
          field: "price",
          pass: priceMatches(livePrice, goldPrice),
          expected: priceRepr(goldPrice),
          actual: priceRepr(livePrice),
        },
        {
          field: "is_bundle",
          pass: bundleSoldEq(r.lib, r.gib),
          expected: fmtScalar(r.gib),
          actual: fmtScalar(r.lib),
        },
        {
          field: "is_sold",
          pass: bundleSoldEq(r.lis, r.gis),
          expected: fmtScalar(r.gis),
          actual: fmtScalar(r.lis),
        },
      ];

    for (const ch of checks) {
      if (ch.pass) ok[ch.field]++;
      else
        failures[ch.field].push({
          listingId: r.id,
          title: r.title,
          expected: ch.expected,
          actual: ch.actual,
        });
    }
  }

  const fields: EvalField[] = [
    "brand",
    "reference",
    "condition",
    "watch_type",
    "price",
    "is_bundle",
    "is_sold",
  ];

  for (const f of fields) {
    const pct = n === 0 ? 0 : (100 * ok[f]) / n;
    console.log(`${f}: ${ok[f]}/${n} (${pct.toFixed(1)}%)`);
  }

  console.log("");
  for (const f of fields) {
    const fails = failures[f];
    if (fails.length === 0) continue;
    console.log(`${f} — mismatches (${fails.length})`);
    for (const row of fails) {
      const titleShort = (row.title ?? "").replace(/\s+/g, " ").slice(0, 90);
      console.log(`  id=${row.listingId}${titleShort ? ` title="${titleShort}${row.title && row.title.length > 90 ? "…" : ""}"` : ""}`);
      console.log(`    expected: ${row.expected}`);
      console.log(`    actual:   ${row.actual}`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
