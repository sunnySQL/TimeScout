"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  adminBtnGhostClass,
  adminBtnMutedClass,
  adminBtnPrimaryClass,
  adminBtnSecondaryClass,
} from "@/app/admin/_components";
import {
  brandReviewOutcomeFromForm,
  brandReviewOutcomeKey,
} from "@/lib/admin/reviewBrandOutcome";
import { removeListingFromGoldEval, saveListingToGoldEval, submitReview } from "./actions";
import { REVIEW_SAVED_EVENT } from "./ReviewSessionCounter";

const CONDITION_OPTIONS = [
  { value: "", label: "— No change" },
  { value: "__unknown__", label: "Unknown" },
  { value: "unworn", label: "Unworn" },
  { value: "excellent", label: "Excellent" },
  { value: "very good", label: "Very good" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
] as const;

const WATCH_OPTIONS = [
  { value: "", label: "— No change" },
  { value: "__unknown__", label: "Unknown" },
  { value: "vintage", label: "Vintage" },
] as const;

const BUNDLE_OPTIONS = [
  { value: "", label: "— No change —" },
  { value: "single", label: "Single listing (not a bundle)" },
  { value: "bundle", label: "Bundle / multi-watch" },
] as const;

function centsToUsd(cents: number | null | undefined): string {
  if (cents == null || cents <= 0) return "";
  return (cents / 100).toFixed(2);
}

/** Parse dollars like "12,345.67" → integer cents; empty → null */
function parseUsdToCents(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Watch-type select value including explicit unknown for gold-eval snapshots. */
function watchSelectFromValueWithUnknown(v: string | null, asUnknown: boolean): string {
  if (asUnknown) return "__unknown__";
  return watchSelectFromValue(v);
}

type Props = {
  listingId: number;
  currentBrand: string | null;
  currentReference: string | null;
  currentCondition: string | null;
  currentWatchType: string | null;
  currentPriceCents: number | null;
  currentPriceMinCents: number | null;
  currentPriceMaxCents: number | null;
  initialNotes: string | null;
  /** Prior save: price marked unknown in review table */
  initialPriceReviewUnknown?: boolean;
  /** Prior save: condition explicitly reviewed as Unknown (listing.condition stays null) */
  initialConditionReviewedUnknown?: boolean;
  listingIsSold?: boolean;
  /** Prior save: reviewer acknowledged sold in queue */
  initialSoldReviewed?: boolean;
  /** Listing has low local confidence (numeric); checkbox clears queue reason when saved */
  rowIsLowLocal?: boolean;
  /** Prior save: low-local queue acknowledged without changing listing ML fields */
  initialLocalReviewed?: boolean;
  /** Current listings.is_bundle (for reviewed summary text). */
  listingIsBundle?: boolean;
  /** Prior save: reviewer locked bundle flag (single vs bundle). */
  initialBundleReviewed?: boolean;
  /** Prior save: brand explicitly reviewed as unknown (listing brand stays null). */
  initialBrandReviewedUnknown?: boolean;
  /** Gold snapshot / explicit unknown: watch_type saved null in `listing_gold_eval`. */
  initialWatchTypeUnknown?: boolean;
  /** Title/description contain 2+ brand detector hits (may include harmless mentions). */
  rowHasMultipleBrandHits?: boolean;
  /** Prior save: reviewer acknowledged multi-brand text as harmless noise. */
  initialMultiBrandReviewed?: boolean;
  /** Gold-eval tab only: show control to delete `listing_gold_eval` row for this listing. */
  showRemoveGoldEval?: boolean;
  /** Server: listing already has a row in `listing_gold_eval`. */
  initialInGoldEval?: boolean;
};

export function ReviewRow({
  listingId,
  currentBrand,
  currentReference,
  currentCondition,
  currentWatchType,
  currentPriceCents,
  currentPriceMinCents,
  currentPriceMaxCents,
  initialNotes,
  initialPriceReviewUnknown = false,
  initialConditionReviewedUnknown = false,
  listingIsSold = false,
  initialSoldReviewed = false,
  rowIsLowLocal = false,
  initialLocalReviewed = false,
  listingIsBundle = false,
  initialBundleReviewed = false,
  initialBrandReviewedUnknown = false,
  initialWatchTypeUnknown = false,
  rowHasMultipleBrandHits = false,
  initialMultiBrandReviewed = false,
  showRemoveGoldEval = false,
  initialInGoldEval = false,
}: Props) {
  const initialNotesStr = initialNotes ?? "";
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState(currentBrand ?? "");
  const [brandUnknown, setBrandUnknown] = useState(initialBrandReviewedUnknown);
  const [reference, setReference] = useState(currentReference ?? "");
  const [conditionSel, setConditionSel] = useState(() =>
    conditionSelectFromValue(currentCondition, initialConditionReviewedUnknown),
  );
  const [watchSel, setWatchSel] = useState(() =>
    watchSelectFromValueWithUnknown(currentWatchType, initialWatchTypeUnknown),
  );
  const [priceUsd, setPriceUsd] = useState(() =>
    initialPriceReviewUnknown ? "" : centsToUsd(currentPriceCents),
  );
  const [priceMinUsd, setPriceMinUsd] = useState(() =>
    initialPriceReviewUnknown ? "" : centsToUsd(currentPriceMinCents),
  );
  const [priceMaxUsd, setPriceMaxUsd] = useState(() =>
    initialPriceReviewUnknown ? "" : centsToUsd(currentPriceMaxCents),
  );
  const [priceUnknown, setPriceUnknown] = useState(initialPriceReviewUnknown);
  const [notes, setNotes] = useState(initialNotesStr);
  const [markSoldReviewed, setMarkSoldReviewed] = useState(false);
  const [markLocalReviewed, setMarkLocalReviewed] = useState(false);
  const [bundleDecision, setBundleDecision] = useState<"" | "single" | "bundle">("");
  const [markMultiBrandReviewed, setMarkMultiBrandReviewed] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [goldPending, startGoldTransition] = useTransition();
  const [removeGoldPending, startRemoveGoldTransition] = useTransition();
  const [goldFeedback, setGoldFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [justSavedGoldEval, setJustSavedGoldEval] = useState(false);

  useEffect(() => {
    if (!initialInGoldEval) setJustSavedGoldEval(false);
  }, [initialInGoldEval]);

  const goldEvalSaveLocked = initialInGoldEval || justSavedGoldEval;

  const baseline = useRef({
    brand: currentBrand ?? "",
    brandUnknown: initialBrandReviewedUnknown,
    reference: currentReference ?? "",
    conditionSel: conditionSelectFromValue(currentCondition, initialConditionReviewedUnknown),
    watchSel: watchSelectFromValueWithUnknown(currentWatchType, initialWatchTypeUnknown),
    priceUsd: initialPriceReviewUnknown ? "" : centsToUsd(currentPriceCents),
    priceMinUsd: initialPriceReviewUnknown ? "" : centsToUsd(currentPriceMinCents),
    priceMaxUsd: initialPriceReviewUnknown ? "" : centsToUsd(currentPriceMaxCents),
    priceUnknown: initialPriceReviewUnknown,
    notes: initialNotesStr,
    soldReviewedPrior: initialSoldReviewed,
    localReviewedPrior: initialLocalReviewed,
    bundleReviewedPrior: initialBundleReviewed,
    multiBrandReviewedPrior: initialMultiBrandReviewed,
  });

  function snapBaselineFromProps() {
    const br = {
      brand: currentBrand ?? "",
      brandUnknown: initialBrandReviewedUnknown,
      reference: currentReference ?? "",
      conditionSel: conditionSelectFromValue(currentCondition, initialConditionReviewedUnknown),
      watchSel: watchSelectFromValueWithUnknown(currentWatchType, initialWatchTypeUnknown),
      priceUsd: initialPriceReviewUnknown ? "" : centsToUsd(currentPriceCents),
      priceMinUsd: initialPriceReviewUnknown ? "" : centsToUsd(currentPriceMinCents),
      priceMaxUsd: initialPriceReviewUnknown ? "" : centsToUsd(currentPriceMaxCents),
      priceUnknown: initialPriceReviewUnknown,
      notes: initialNotesStr,
      soldReviewedPrior: initialSoldReviewed,
      localReviewedPrior: initialLocalReviewed,
      bundleReviewedPrior: initialBundleReviewed,
      multiBrandReviewedPrior: initialMultiBrandReviewed,
    };
    baseline.current = br;
    setBrand(br.brand);
    setBrandUnknown(br.brandUnknown);
    setReference(br.reference);
    setConditionSel(br.conditionSel);
    setWatchSel(br.watchSel);
    setPriceUsd(br.priceUsd);
    setPriceMinUsd(br.priceMinUsd);
    setPriceMaxUsd(br.priceMaxUsd);
    setPriceUnknown(initialPriceReviewUnknown);
    setNotes(br.notes);
    setMarkSoldReviewed(false);
    setMarkLocalReviewed(false);
    setBundleDecision("");
    setMarkMultiBrandReviewed(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setJustSavedGoldEval(false);
          snapBaselineFromProps();
          setOpen(true);
        }}
        className={adminBtnGhostClass}
      >
        Edit
      </button>
    );
  }

  function handleSubmit() {
    const b = baseline.current;
    const payload: Parameters<typeof submitReview>[0] = {
      listingId,
      notes: notes.trim() ? notes.trim() : null,
    };

    const prevBrandKey = brandReviewOutcomeKey(
      brandReviewOutcomeFromForm(b.brand.trim(), b.brandUnknown),
      b.brand.trim(),
    );
    const nextBrandKey = brandReviewOutcomeKey(
      brandReviewOutcomeFromForm(brand.trim(), brandUnknown),
      brand.trim(),
    );
    if (prevBrandKey !== nextBrandKey) {
      payload.touchBrand = true;
      const nextKind = brandReviewOutcomeFromForm(brand.trim(), brandUnknown);
      if (nextKind === "value") {
        payload.brand = brand.trim();
        payload.brandUnknown = false;
      } else if (nextKind === "unknown") {
        payload.brand = null;
        payload.brandUnknown = true;
      } else {
        payload.brand = null;
        payload.brandUnknown = false;
      }
    }
    if (reference.trim() !== b.reference.trim()) {
      payload.touchReference = true;
      payload.reference = reference.trim() ? reference.trim() : null;
    }

    if (conditionSel !== b.conditionSel) {
      if (conditionSel === "") {
        // No change — omit
      } else if (conditionSel === "__unknown__") {
        payload.touchCondition = true;
        payload.condition = null;
      } else {
        payload.touchCondition = true;
        payload.condition = conditionSel;
      }
    }

    if (watchSel !== b.watchSel) {
      if (watchSel === "") {
      } else if (watchSel === "__unknown__") {
        payload.touchWatchType = true;
        payload.watchType = null;
      } else {
        payload.touchWatchType = true;
        payload.watchType = watchSel;
      }
    }

    const priceValsDirty =
      priceUsd.trim() !== b.priceUsd.trim() ||
      priceMinUsd.trim() !== b.priceMinUsd.trim() ||
      priceMaxUsd.trim() !== b.priceMaxUsd.trim();
    const priceUnknownDirty = priceUnknown !== b.priceUnknown;

    if (priceUnknown) {
      if (priceUnknownDirty || priceValsDirty) {
        payload.touchPrice = true;
        payload.priceUnknown = true;
      }
    } else if (priceValsDirty) {
      const main = parseUsdToCents(priceUsd);
      const minC = parseUsdToCents(priceMinUsd);
      const maxC = parseUsdToCents(priceMaxUsd);
      if (main != null) {
        payload.touchPrice = true;
        payload.priceUnknown = false;
        payload.priceCents = main;
        payload.priceMinCents = null;
        payload.priceMaxCents = null;
      } else if (minC != null && maxC != null) {
        payload.touchPrice = true;
        payload.priceUnknown = false;
        payload.priceCents = Math.round((minC + maxC) / 2);
        payload.priceMinCents = minC;
        payload.priceMaxCents = maxC;
      }
    }

    const bSold = baseline.current.soldReviewedPrior;
    if (listingIsSold && markSoldReviewed && !bSold) {
      payload.touchSold = true;
      payload.soldReviewed = true;
    }

    const bLocal = baseline.current.localReviewedPrior;
    if (rowIsLowLocal && markLocalReviewed && !bLocal) {
      payload.touchLocalReviewed = true;
      payload.localReviewed = true;
    }

    const touchBundleSubmit = bundleDecision !== "";
    if (touchBundleSubmit) {
      payload.touchBundle = true;
      payload.isBundle = bundleDecision === "bundle";
    }

    const bMultiBrand = baseline.current.multiBrandReviewedPrior;
    if (rowHasMultipleBrandHits && markMultiBrandReviewed && !bMultiBrand) {
      payload.touchMultiBrandReviewed = true;
      payload.multiBrandReviewed = true;
    }

    const classificationSent =
      Boolean(payload.touchBrand) ||
      Boolean(payload.touchReference) ||
      Boolean(payload.touchCondition) ||
      Boolean(payload.touchWatchType);

    startTransition(async () => {
      await submitReview(payload);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(REVIEW_SAVED_EVENT));
      }
      router.refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setOpen(false);
      const savedBrandKind = brandReviewOutcomeFromForm(brand.trim(), brandUnknown);
      baseline.current = {
        brand: savedBrandKind === "value" ? brand.trim() : "",
        brandUnknown: savedBrandKind === "unknown",
        reference,
        conditionSel,
        watchSel,
        priceUsd,
        priceMinUsd,
        priceMaxUsd,
        priceUnknown,
        notes,
        soldReviewedPrior: listingIsSold ? markSoldReviewed || bSold : false,
        localReviewedPrior:
          bLocal ||
          classificationSent ||
          (rowIsLowLocal && markLocalReviewed),
        bundleReviewedPrior: touchBundleSubmit || baseline.current.bundleReviewedPrior,
        multiBrandReviewedPrior:
          rowHasMultipleBrandHits ? markMultiBrandReviewed || bMultiBrand : false,
      };
    });
  }

  const inputCls =
    "block w-full rounded border border-stone-300 bg-white px-1.5 py-0.5 text-xs dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200";
  const selectCls =
    "block w-full rounded border border-stone-300 bg-white px-1 py-0.5 text-xs dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200";
  const rowLabelCls = "mb-0.5 block text-[10px] text-stone-500 dark:text-stone-400";
  const mutedRowCls = "text-[10px] text-stone-400 dark:text-stone-500";

  return (
    <div className="flex w-full min-w-[12rem] max-w-xl flex-col gap-2 border border-stone-200 bg-stone-50 p-2 dark:border-stone-700 dark:bg-stone-950/40">
      {/* Brand */}
      <div className="w-full">
        <span className={rowLabelCls}>Brand</span>
        <input
          className={inputCls}
          value={brand}
          disabled={brandUnknown}
          onChange={(e) => {
            setBrand(e.target.value);
            setBrandUnknown(false);
          }}
        />
      </div>

      {/* Brand unknown */}
      <div className="w-full">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={brandUnknown}
            onChange={(e) => {
              const on = e.target.checked;
              setBrandUnknown(on);
              if (on) setBrand("");
            }}
          />
          <span className="text-[10px] text-stone-600 dark:text-stone-400">Brand unknown</span>
        </label>
      </div>

      {/* Ref */}
      <div className="w-full">
        <span className={rowLabelCls}>Ref</span>
        <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>

      {/* Condition */}
      <div className="w-full">
        <span className={rowLabelCls}>Condition</span>
        <select className={selectCls} value={conditionSel} onChange={(e) => setConditionSel(e.target.value)}>
          {CONDITION_OPTIONS.map((o) => (
            <option key={o.value || "noop"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Watch type */}
      <div className="w-full">
        <span className={rowLabelCls}>Watch type</span>
        <select className={selectCls} value={watchSel} onChange={(e) => setWatchSel(e.target.value)}>
          {WATCH_OPTIONS.map((o) => (
            <option key={o.value || "noop"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Price (USD) */}
      <div className="w-full">
        <span className={rowLabelCls}>Price (USD)</span>
        <input
          className={inputCls}
          value={priceUsd}
          onChange={(e) => setPriceUsd(e.target.value)}
          placeholder="e.g. 4500"
          disabled={priceUnknown}
        />
      </div>

      {/* Min */}
      <div className="w-full">
        <span className={rowLabelCls}>Min</span>
        <input
          className={inputCls}
          value={priceMinUsd}
          onChange={(e) => setPriceMinUsd(e.target.value)}
          placeholder="min"
          disabled={priceUnknown}
        />
      </div>

      {/* Max */}
      <div className="w-full">
        <span className={rowLabelCls}>Max</span>
        <input
          className={inputCls}
          value={priceMaxUsd}
          onChange={(e) => setPriceMaxUsd(e.target.value)}
          placeholder="max"
          disabled={priceUnknown}
        />
      </div>

      {/* Unknown price */}
      <div className="w-full">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={priceUnknown} onChange={(e) => setPriceUnknown(e.target.checked)} />
          <span className="text-[10px] text-stone-600 dark:text-stone-400">Unknown price (export only)</span>
        </label>
      </div>

      {/* Notes */}
      <div className="w-full">
        <span className={rowLabelCls}>Notes</span>
        <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
      </div>

      {/* Sold review */}
      <div className="w-full">
        <span className={rowLabelCls}>Sold review</span>
        {!listingIsSold ? (
          <p className={mutedRowCls}>Not flagged sold</p>
        ) : initialSoldReviewed ? (
          <p className="text-[10px] text-stone-500 dark:text-stone-400">Sold reviewed (queue only).</p>
        ) : (
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={markSoldReviewed}
              onChange={(e) => setMarkSoldReviewed(e.target.checked)}
            />
            <span className="text-[10px] text-stone-600 dark:text-stone-400">
              Mark sold reviewed (does not change listing sold status)
            </span>
          </label>
        )}
      </div>

      {/* Local confidence review */}
      <div className="w-full">
        <span className={rowLabelCls}>Local confidence review</span>
        {!rowIsLowLocal ? (
          <p className={mutedRowCls}>Not low confidence</p>
        ) : initialLocalReviewed ? (
          <p className="text-[10px] text-stone-500 dark:text-stone-400">Local confidence reviewed (queue only).</p>
        ) : (
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={markLocalReviewed}
              onChange={(e) => setMarkLocalReviewed(e.target.checked)}
            />
            <span className="text-[10px] text-stone-600 dark:text-stone-400">
              Mark local confidence reviewed (does not change listing scores)
            </span>
          </label>
        )}
      </div>

      {/* Multi-brand mentions review */}
      <div className="w-full">
        <span className={rowLabelCls}>Multi-brand mentions review</span>
        {!rowHasMultipleBrandHits ? (
          <p className={mutedRowCls}>No multi-brand flag</p>
        ) : initialMultiBrandReviewed ? (
          <p className="text-[10px] text-stone-500 dark:text-stone-400">
            Multi-brand mentions reviewed — extra brands treated as harmless noise (queue only).
          </p>
        ) : (
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={markMultiBrandReviewed}
              onChange={(e) => setMarkMultiBrandReviewed(e.target.checked)}
            />
            <span className="text-[10px] text-stone-600 dark:text-stone-400">
              Mark multi-brand mentions reviewed — extra mentions are harmless/noise (trades, seller bio,
              comparisons, homages, compatibility, subreddit refs). Does not change the listing.
            </span>
          </label>
        )}
      </div>

      {/* Bundle */}
      <div className="w-full">
        <span className={rowLabelCls}>Bundle</span>
        {initialBundleReviewed ? (
          <p className="text-[10px] text-stone-500 dark:text-stone-400">
            Bundle reviewed: {listingIsBundle ? "Flagged as bundle" : "Single listing"}.
          </p>
        ) : (
          <select
            className={selectCls}
            value={bundleDecision}
            onChange={(e) => setBundleDecision(e.target.value as "" | "single" | "bundle")}
          >
            {BUNDLE_OPTIONS.map((o) => (
              <option key={o.value || "noop"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Save / Cancel */}
      <div className="flex w-full flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || goldPending || removeGoldPending}
          className={`${adminBtnPrimaryClass} px-2 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {isPending ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={goldPending || removeGoldPending}
          className={`${adminBtnSecondaryClass} border-transparent bg-transparent px-2 py-0.5 text-[10px] shadow-none hover:bg-stone-100 dark:hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={goldEvalSaveLocked || isPending || goldPending || removeGoldPending}
          onClick={() => {
            startGoldTransition(async () => {
              const res = await saveListingToGoldEval(listingId, notes.trim() || undefined);
              if (res.ok) {
                if (!showRemoveGoldEval) setJustSavedGoldEval(true);
                setOpen(false);
                router.refresh();
                setGoldFeedback({ ok: true, text: "Saved to gold eval" });
              } else {
                const dup = "code" in res && res.code === "already_saved";
                setGoldFeedback({
                  ok: false,
                  text: dup
                    ? "Already saved to gold eval — remove it first to replace frozen labels."
                    : res.error,
                });
              }
              setTimeout(() => setGoldFeedback(null), res.ok ? 2000 : 5000);
            });
          }}
          className={
            goldEvalSaveLocked
              ? `${adminBtnMutedClass} cursor-not-allowed px-2 py-0.5 text-[10px] opacity-70`
              : `${adminBtnSecondaryClass} px-2 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-50`
          }
        >
          {goldPending ? "…" : goldEvalSaveLocked ? "Saved to gold eval" : "Save to gold eval"}
        </button>
        {showRemoveGoldEval && (
          <button
            type="button"
            disabled={isPending || goldPending || removeGoldPending}
            onClick={() => {
              if (
                !confirm(
                  "Remove this listing from the gold eval set only? Listing and review rows are unchanged; training exports will include it again unless you re-add it.",
                )
              ) {
                return;
              }
              startRemoveGoldTransition(async () => {
                const res = await removeListingFromGoldEval(listingId);
                if (!res.ok) {
                  window.alert(res.error);
                  return;
                }
                router.refresh();
              });
            }}
            className={`${adminBtnSecondaryClass} px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40`}
          >
            {removeGoldPending ? "…" : "Remove from gold eval"}
          </button>
        )}
        {saved && <span className="text-[10px] text-green-600">Saved</span>}
        {goldFeedback && (
          <span
            className={
              goldFeedback.ok
                ? "text-[10px] text-green-600 dark:text-green-500"
                : "text-[10px] text-red-600 dark:text-red-400"
            }
          >
            {goldFeedback.text}
          </span>
        )}
      </div>
    </div>
  );
}

function conditionSelectFromValue(v: string | null, reviewedAsUnknown = false): string {
  if (!v) return reviewedAsUnknown ? "__unknown__" : "";
  const ok = CONDITION_OPTIONS.some((o) => o.value === v);
  return ok ? v : "";
}

function watchSelectFromValue(v: string | null): string {
  if (!v) return "";
  const ok = WATCH_OPTIONS.some((o) => o.value === v);
  return ok ? v : "";
}
