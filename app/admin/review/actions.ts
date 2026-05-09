"use server";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { computeGoldEvalSnapshot, resolveGoldEvalNotes } from "@/lib/admin/goldEvalSnapshot";
import { listings, listingGoldEval, listingLabelReviews } from "@/db/schema";
import { revalidatePath } from "next/cache";

/** Delta submission: include touch* only for fields the reviewer changed this save. */
export type ReviewPayload = {
  listingId: number;
  notes: string | null;

  touchBrand?: boolean;
  brand?: string | null;
  /** With touchBrand and empty brand: true = reviewed as unknown; false = clear brand_reviewed */
  brandUnknown?: boolean;

  touchReference?: boolean;
  reference?: string | null;

  touchCondition?: boolean;
  /** Canonical condition label, or null when reviewed unknown */
  condition?: string | null;

  touchWatchType?: boolean;
  /** "vintage" or null when reviewed unknown */
  watchType?: string | null;

  touchPrice?: boolean;
  /** Review-only: price unknown — does not write listings.price_* */
  priceUnknown?: boolean;
  priceCents?: number | null;
  priceMinCents?: number | null;
  priceMaxCents?: number | null;

  /** Acknowledge sold listing in review queue only — does not modify listings.is_sold. */
  touchSold?: boolean;
  /** When touching sold, set false only if explicitly rejecting review ack (default true). */
  soldReviewed?: boolean;

  /** Acknowledge low local-confidence row in review queue (does not change listing ML scores). */
  touchLocalReviewed?: boolean;
  localReviewed?: boolean;

  /** Set listings.is_bundle and lock flag so ingest/backfill respects the correction. */
  touchBundle?: boolean;
  isBundle?: boolean;

  /** Acknowledge multi-brand mention noise as harmless (queue only; does not change listings). */
  touchMultiBrandReviewed?: boolean;
  multiBrandReviewed?: boolean;
};

const VALID_CONDITIONS = new Set(["unworn", "excellent", "very good", "good", "fair"]);

export type SaveToGoldEvalResult =
  | { ok: true }
  | { ok: false; error: string; code?: "already_saved" };

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sqlBool(v: unknown): boolean {
  return v === true || v === 1;
}

/**
 * Insert `listing_gold_eval` from effective labels (review overrides when the
 * corresponding *_reviewed flag is set; otherwise listing columns).
 * Fails if a row already exists for this listing (no overwrite).
 * Notes: optional `notesFromClient` (e.g. current review form text); else DB review notes.
 */
export async function saveListingToGoldEval(
  listingId: number,
  notesFromClient?: string | null,
): Promise<SaveToGoldEvalResult> {
  if (!listingId || listingId <= 0) return { ok: false, error: "Invalid listing id" };

  const db = getDb();

  const [listingRow] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
  if (!listingRow) return { ok: false, error: "Listing not found" };

  const [reviewRow] = await db
    .select()
    .from(listingLabelReviews)
    .where(eq(listingLabelReviews.listingId, listingId))
    .limit(1);

  const listingInput = {
    brand: listingRow.brand,
    reference: listingRow.reference,
    condition: listingRow.condition,
    watchType: listingRow.watchType,
    priceCents: numOrNull(listingRow.priceCents),
    priceMinCents: numOrNull(listingRow.priceMinCents),
    priceMaxCents: numOrNull(listingRow.priceMaxCents),
    isBundle: sqlBool(listingRow.isBundle),
    isSold: sqlBool(listingRow.isSold),
  };

  const reviewInput = reviewRow
    ? {
        brand: reviewRow.brand,
        reference: reviewRow.reference,
        condition: reviewRow.condition,
        watchType: reviewRow.watchType,
        priceCents: numOrNull(reviewRow.priceCents),
        priceMinCents: numOrNull(reviewRow.priceMinCents),
        priceMaxCents: numOrNull(reviewRow.priceMaxCents),
        brandReviewed: sqlBool(reviewRow.brandReviewed),
        referenceReviewed: sqlBool(reviewRow.referenceReviewed),
        conditionReviewed: sqlBool(reviewRow.conditionReviewed),
        watchTypeReviewed: sqlBool(reviewRow.watchTypeReviewed),
        priceReviewed: sqlBool(reviewRow.priceReviewed),
      }
    : null;

  const snap = computeGoldEvalSnapshot(listingInput, reviewInput);
  const notes = resolveGoldEvalNotes(notesFromClient, reviewRow?.notes ?? null);

  const [existingGold] = await db
    .select({ listingId: listingGoldEval.listingId })
    .from(listingGoldEval)
    .where(eq(listingGoldEval.listingId, listingId))
    .limit(1);

  if (existingGold) {
    return {
      ok: false,
      code: "already_saved",
      error: "This listing is already in gold eval (remove it first to replace).",
    };
  }

  await db.insert(listingGoldEval).values({
    listingId,
    brand: snap.brand,
    reference: snap.reference,
    condition: snap.condition,
    watchType: snap.watchType,
    priceCents: snap.priceCents ?? null,
    priceMinCents: snap.priceMinCents ?? null,
    priceMaxCents: snap.priceMaxCents ?? null,
    isBundle: snap.isBundle,
    isSold: snap.isSold,
    notes,
  });

  revalidatePath("/admin/review");
  return { ok: true };
}

/** Removes gold-eval labels only (listing + review rows unchanged). */
export async function removeListingFromGoldEval(listingId: number): Promise<SaveToGoldEvalResult> {
  if (!listingId || listingId <= 0) return { ok: false, error: "Invalid listing id" };

  const db = getDb();
  await db.delete(listingGoldEval).where(eq(listingGoldEval.listingId, listingId));
  revalidatePath("/admin/review");
  return { ok: true };
}

export async function submitReview(payload: ReviewPayload) {
  const { listingId } = payload;
  if (!listingId || listingId <= 0) throw new Error("Invalid listing id");

  if (payload.touchCondition && payload.condition != null && payload.condition !== "") {
    if (!VALID_CONDITIONS.has(payload.condition)) {
      throw new Error(`Invalid condition: ${payload.condition}`);
    }
  }
  if (payload.touchWatchType && payload.watchType != null && payload.watchType !== "") {
    if (payload.watchType !== "vintage") {
      throw new Error(`Invalid watchType: ${payload.watchType}`);
    }
  }

  if (
    payload.touchPrice &&
    !payload.priceUnknown &&
    (payload.priceCents == null ||
      payload.priceCents < 0 ||
      !Number.isFinite(payload.priceCents))
  ) {
    throw new Error("Price override requires a valid dollar amount or explicit unknown.");
  }

  const db = getDb();

  const [existing] = await db
    .select()
    .from(listingLabelReviews)
    .where(eq(listingLabelReviews.listingId, listingId))
    .limit(1);

  const merged = {
    listingId,
    brand: existing?.brand ?? null,
    reference: existing?.reference ?? null,
    condition: existing?.condition ?? null,
    watchType: existing?.watchType ?? null,
    brandReviewed: existing?.brandReviewed ?? false,
    referenceReviewed: existing?.referenceReviewed ?? false,
    conditionReviewed: existing?.conditionReviewed ?? false,
    watchTypeReviewed: existing?.watchTypeReviewed ?? false,
    priceReviewed: existing?.priceReviewed ?? false,
    priceCents: existing?.priceCents ?? null,
    priceMinCents: existing?.priceMinCents ?? null,
    priceMaxCents: existing?.priceMaxCents ?? null,
    notes: existing?.notes ?? null,
    soldReviewed: existing?.soldReviewed ?? false,
    localReviewed: existing?.localReviewed ?? false,
    bundleReviewed: existing?.bundleReviewed ?? false,
    multiBrandReviewed: existing?.multiBrandReviewed ?? false,
  };

  if (payload.touchBrand) {
    const trimmedBrand = payload.brand?.trim() ?? "";
    if (trimmedBrand) {
      merged.brand = trimmedBrand;
      merged.brandReviewed = true;
    } else if (payload.brandUnknown) {
      merged.brand = null;
      merged.brandReviewed = true;
    } else {
      merged.brand = null;
      merged.brandReviewed = false;
    }
  }
  if (payload.touchReference) {
    merged.reference = payload.reference?.trim() ? payload.reference.trim() : null;
    merged.referenceReviewed = true;
  }
  if (payload.touchCondition) {
    merged.condition =
      payload.condition != null && payload.condition !== "" ? payload.condition : null;
    merged.conditionReviewed = true;
  }
  if (payload.touchWatchType) {
    merged.watchType =
      payload.watchType != null && payload.watchType !== "" ? payload.watchType : null;
    merged.watchTypeReviewed = true;
  }
  if (payload.touchPrice) {
    merged.priceReviewed = true;
    if (payload.priceUnknown) {
      merged.priceCents = null;
      merged.priceMinCents = null;
      merged.priceMaxCents = null;
    } else {
      merged.priceCents = payload.priceCents ?? null;
      merged.priceMinCents = payload.priceMinCents ?? null;
      merged.priceMaxCents = payload.priceMaxCents ?? null;
    }
  }
  if (payload.touchSold) {
    merged.soldReviewed = payload.soldReviewed !== false;
  }

  const classificationTouched =
    Boolean(payload.touchBrand) ||
    Boolean(payload.touchReference) ||
    Boolean(payload.touchCondition) ||
    Boolean(payload.touchWatchType);
  if (classificationTouched) {
    merged.localReviewed = true;
  }
  if (payload.touchLocalReviewed) {
    merged.localReviewed = payload.localReviewed !== false;
  }
  if (payload.touchBundle) {
    merged.bundleReviewed = true;
  }
  if (payload.touchMultiBrandReviewed) {
    merged.multiBrandReviewed = payload.multiBrandReviewed !== false;
  }

  merged.notes = payload.notes?.trim() ? payload.notes.trim() : null;

  await db
    .insert(listingLabelReviews)
    .values({
      listingId: merged.listingId,
      brand: merged.brand,
      reference: merged.reference,
      condition: merged.condition,
      watchType: merged.watchType,
      brandReviewed: merged.brandReviewed,
      referenceReviewed: merged.referenceReviewed,
      conditionReviewed: merged.conditionReviewed,
      watchTypeReviewed: merged.watchTypeReviewed,
      priceReviewed: merged.priceReviewed,
      priceCents: merged.priceCents ?? null,
      priceMinCents: merged.priceMinCents ?? null,
      priceMaxCents: merged.priceMaxCents ?? null,
      soldReviewed: merged.soldReviewed,
      localReviewed: merged.localReviewed,
      bundleReviewed: merged.bundleReviewed,
      multiBrandReviewed: merged.multiBrandReviewed,
      notes: merged.notes,
      reviewedAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        brand: merged.brand,
        reference: merged.reference,
        condition: merged.condition,
        watchType: merged.watchType,
        brandReviewed: merged.brandReviewed,
        referenceReviewed: merged.referenceReviewed,
        conditionReviewed: merged.conditionReviewed,
        watchTypeReviewed: merged.watchTypeReviewed,
        priceReviewed: merged.priceReviewed,
        priceCents: merged.priceCents,
        priceMinCents: merged.priceMinCents,
        priceMaxCents: merged.priceMaxCents,
        soldReviewed: merged.soldReviewed,
        localReviewed: merged.localReviewed,
        bundleReviewed: merged.bundleReviewed,
        multiBrandReviewed: merged.multiBrandReviewed,
        notes: merged.notes,
        reviewedAt: sql`CURRENT_TIMESTAMP`,
      },
    });

  const listingSet: Record<string, unknown> = {};
  let touchedClassification = false;

  if (payload.touchBrand) {
    touchedClassification = true;
    const trimmedBrand = payload.brand?.trim() ?? "";
    if (trimmedBrand) {
      listingSet.brand = trimmedBrand;
      listingSet.brandSource = "manual";
      listingSet.brandConfidence = "1.000";
    } else if (payload.brandUnknown) {
      listingSet.brand = null;
    }
  }
  if (payload.touchReference) {
    touchedClassification = true;
    if (merged.reference) {
      listingSet.reference = merged.reference;
      listingSet.referenceSource = "manual";
      listingSet.referenceConfidence = null;
    } else {
      listingSet.reference = null;
      listingSet.referenceSource = "manual";
      listingSet.referenceConfidence = null;
    }
  }
  if (payload.touchCondition) {
    touchedClassification = true;
    if (merged.condition) {
      listingSet.condition = merged.condition;
      listingSet.conditionSource = "manual";
      listingSet.conditionConfidence = null;
    } else {
      listingSet.condition = null;
      listingSet.conditionSource = "manual";
      listingSet.conditionConfidence = null;
    }
  }
  if (payload.touchWatchType) {
    touchedClassification = true;
    if (merged.watchType) {
      listingSet.watchType = merged.watchType;
      listingSet.watchTypeSource = "manual";
      listingSet.watchTypeConfidence = null;
    } else {
      listingSet.watchType = null;
      listingSet.watchTypeSource = "manual";
      listingSet.watchTypeConfidence = null;
    }
  }
  if (payload.touchPrice && !payload.priceUnknown) {
    listingSet.priceCents = merged.priceCents ?? undefined;
    listingSet.priceMinCents = merged.priceMinCents ?? undefined;
    listingSet.priceMaxCents = merged.priceMaxCents ?? undefined;
  }

  if (touchedClassification) {
    listingSet.classifierSource = "manual";
  }
  if (payload.touchBundle) {
    listingSet.isBundle = payload.isBundle === true;
  }

  if (Object.keys(listingSet).length > 0) {
    await db.update(listings).set(listingSet).where(eq(listings.id, listingId));
  }

  revalidatePath("/admin/review");
  revalidatePath("/admin/data-health");
}
