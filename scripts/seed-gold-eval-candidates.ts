/**
 * Sample listing IDs across review-queue-style buckets for manual gold-eval curation.
 * Does not insert labels — outputs candidates only.
 *
 * Writes ml/data/gold_eval_candidates.csv and prints a short summary.
 *
 * Usage:
 *   npm run seed:gold-eval-candidates -- --limit 150
 */

import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { and, desc, eq, gte, isNull, not, notInArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { MULTI_BRAND_CANDIDATE_CAP, REVIEW_RECENT_DAYS } from "@/app/admin/review/constants";
import {
  missingBrandUnresolvedSql,
  missingPriceUnresolvedSql,
  reviewAllFlaggedOrSql,
  reviewBundleUnresolvedSql,
  reviewConditionUnresolvedSql,
  reviewLowLocalUnresolvedSql,
  reviewSoldUnresolvedSql,
} from "@/app/admin/review/queuePredicates";
import { shouldFlagMultiBrandReason } from "@/lib/admin/multiBrandReason";
import { listAllBrandHits, stripTradePreferenceSections } from "@/lib/watches/parse";
import { getDb, getPool } from "@/db";
import { listingGoldEval, listingLabelReviews, listings } from "@/db/schema";

type CandidateRow = {
  listing_id: number;
  title: string;
  listing_url: string;
  reason: string;
};

function parseLimit(): number {
  const argv = process.argv.slice(2);
  let limit = 150;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--limit" && next) {
      const n = Math.max(1, Math.floor(Number(next)) || 150);
      limit = n;
      break;
    }
  }
  return limit;
}

/** Split `limit` across `bucketCount` buckets; earlier buckets get +1 remainder. */
function splitQuota(limit: number, bucketCount: number): number[] {
  const base = Math.floor(limit / bucketCount);
  const rem = limit % bucketCount;
  return Array.from({ length: bucketCount }, (_, i) => base + (i < rem ? 1 : 0));
}

function sqlBoolTrue(v: unknown): boolean {
  return v === true || v === 1;
}

function listingMultiBrandHitCount(title: string | null, description: string | null): number {
  const text = stripTradePreferenceSections(
    [title, description].filter(Boolean).join("\n\n"),
  );
  return listAllBrandHits(text).size;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function withUsed(used: Set<number>): SQL | undefined {
  if (used.size === 0) return undefined;
  return notInArray(listings.id, [...used]);
}

async function pickSqlBucket(
  db: ReturnType<typeof getDb>,
  recent: SQL,
  bucketWhere: SQL,
  quota: number,
  reason: string,
  used: Set<number>,
): Promise<CandidateRow[]> {
  if (quota <= 0) return [];

  const parts: SQL[] = [recent, isNull(listingGoldEval.listingId), bucketWhere];
  const u = withUsed(used);
  if (u) parts.push(u);

  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      listingUrl: listings.listingUrl,
    })
    .from(listings)
    .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
    .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
    .where(and(...parts)!)
    .orderBy(desc(listings.firstSeenAt))
    .limit(quota);

  const out: CandidateRow[] = [];
  for (const r of rows) {
    if (used.has(r.id)) continue;
    used.add(r.id);
    out.push({
      listing_id: r.id,
      title: r.title ?? "",
      listing_url: r.listingUrl,
      reason,
    });
    if (out.length >= quota) break;
  }
  return out;
}

async function pickMultiBrandBucket(
  db: ReturnType<typeof getDb>,
  recent: SQL,
  quota: number,
  used: Set<number>,
): Promise<CandidateRow[]> {
  if (quota <= 0) return [];

  const parts: SQL[] = [recent, isNull(listingGoldEval.listingId)];
  const u = withUsed(used);
  if (u) parts.push(u);

  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      description: listings.description,
      listingUrl: listings.listingUrl,
      multiBrandReviewed: listingLabelReviews.multiBrandReviewed,
    })
    .from(listings)
    .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
    .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
    .where(and(...parts)!)
    .orderBy(desc(listings.firstSeenAt))
    .limit(MULTI_BRAND_CANDIDATE_CAP);

  const out: CandidateRow[] = [];
  const reason = "multi-brand mentions";
  for (const r of rows) {
    if (used.has(r.id)) continue;
    const hits = listingMultiBrandHitCount(r.title, r.description);
    if (!shouldFlagMultiBrandReason(hits, sqlBoolTrue(r.multiBrandReviewed))) continue;
    used.add(r.id);
    out.push({
      listing_id: r.id,
      title: r.title ?? "",
      listing_url: r.listingUrl,
      reason,
    });
    if (out.length >= quota) break;
  }
  return out;
}

async function pickCleanBucket(
  db: ReturnType<typeof getDb>,
  recent: SQL,
  quota: number,
  used: Set<number>,
): Promise<CandidateRow[]> {
  if (quota <= 0) return [];

  const parts: SQL[] = [recent, isNull(listingGoldEval.listingId), not(reviewAllFlaggedOrSql)];
  const u = withUsed(used);
  if (u) parts.push(u);

  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      description: listings.description,
      listingUrl: listings.listingUrl,
    })
    .from(listings)
    .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
    .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
    .where(and(...parts)!)
    .orderBy(desc(listings.firstSeenAt))
    .limit(Math.max(quota * 25, quota));

  const out: CandidateRow[] = [];
  const reason = "clean normal row";
  for (const r of rows) {
    if (used.has(r.id)) continue;
    const hits = listingMultiBrandHitCount(r.title, r.description);
    if (hits >= 2) continue;
    used.add(r.id);
    out.push({
      listing_id: r.id,
      title: r.title ?? "",
      listing_url: r.listingUrl,
      reason,
    });
    if (out.length >= quota) break;
  }
  return out;
}

async function main() {
  const limit = parseLimit();
  const quotas = splitQuota(limit, 8);
  const db = getDb();
  const since = new Date(Date.now() - REVIEW_RECENT_DAYS * 24 * 60 * 60 * 1000);
  const recent = gte(listings.firstSeenAt, since);

  const used = new Set<number>();
  const buckets: CandidateRow[] = [];

  buckets.push(
    ...(await pickSqlBucket(db, recent, missingBrandUnresolvedSql, quotas[0]!, "missing brand", used)),
  );
  buckets.push(
    ...(await pickSqlBucket(db, recent, missingPriceUnresolvedSql, quotas[1]!, "missing price", used)),
  );
  buckets.push(
    ...(await pickSqlBucket(
      db,
      recent,
      reviewConditionUnresolvedSql,
      quotas[2]!,
      "missing condition",
      used,
    )),
  );
  buckets.push(
    ...(await pickSqlBucket(db, recent, reviewLowLocalUnresolvedSql, quotas[3]!, "low local confidence", used)),
  );
  buckets.push(
    ...(await pickSqlBucket(db, recent, reviewBundleUnresolvedSql, quotas[4]!, "possible bundle", used)),
  );
  buckets.push(
    ...(await pickSqlBucket(db, recent, reviewSoldUnresolvedSql, quotas[5]!, "sold detected", used)),
  );
  buckets.push(...(await pickMultiBrandBucket(db, recent, quotas[6]!, used)));
  buckets.push(...(await pickCleanBucket(db, recent, quotas[7]!, used)));

  if (buckets.length < limit) {
    const need = limit - buckets.length;
    const parts: SQL[] = [recent, isNull(listingGoldEval.listingId)];
    const u = withUsed(used);
    if (u) parts.push(u);
    const rows = await db
      .select({
        id: listings.id,
        title: listings.title,
        listingUrl: listings.listingUrl,
      })
      .from(listings)
      .leftJoin(listingGoldEval, eq(listingGoldEval.listingId, listings.id))
      .where(and(...parts)!)
      .orderBy(desc(listings.firstSeenAt))
      .limit(Math.max(need * 5, need));

    const fillReason = "recent listing (quota fill)";
    for (const r of rows) {
      if (buckets.length >= limit) break;
      if (used.has(r.id)) continue;
      used.add(r.id);
      buckets.push({
        listing_id: r.id,
        title: r.title ?? "",
        listing_url: r.listingUrl,
        reason: fillReason,
      });
    }
  }

  const outDir = path.join(process.cwd(), "ml", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "gold_eval_candidates.csv");

  const header = "listing_id,title,listing_url,reason";
  const lines = [
    header,
    ...buckets.map(
      (c) =>
        [csvEscape(c.listing_id), csvEscape(c.title), csvEscape(c.listing_url), csvEscape(c.reason)].join(
          ",",
        ),
    ),
  ];
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  console.log(`[seed-gold-eval-candidates] limit=${limit} → ${buckets.length} candidate(s)`);
  console.log(`[seed-gold-eval-candidates] wrote ${outPath}`);
  const preview = buckets.slice(0, 15);
  if (preview.length > 0) {
    console.log("[seed-gold-eval-candidates] preview (first 15):");
    for (const c of preview) {
      console.log(`  ${c.listing_id}\t${c.reason}\t${c.title.slice(0, 80)}${c.title.length > 80 ? "…" : ""}`);
    }
  }

  const byReason = new Map<string, number>();
  for (const c of buckets) {
    byReason.set(c.reason, (byReason.get(c.reason) ?? 0) + 1);
  }
  console.log("[seed-gold-eval-candidates] counts by reason:");
  for (const [reason, n] of [...byReason.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${reason}: ${n}`);
  }
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
