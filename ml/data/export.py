"""
Export labeled listing data from MySQL to CSVs for model training.

Reads DATABASE_URL from ../.env (project root).

Supports tiered label quality: manual review overrides (gold) > regex labels
(silver) > high-confidence ML/AI labels (bronze). Low-confidence ML labels
are excluded from training CSVs by default; pass --include-low-confidence
to include them.

Rows present in `listing_gold_eval` are excluded entirely: that table holds the
human-curated **offline gold evaluation** set and must not leak into training
exports (see docs/gold-eval.md).

Manual review overrides apply only when the corresponding *_reviewed flag is
true on listing_label_reviews. Nullable label + reviewed=true means the
reviewer marked the value unknown — effective_* must be null (no DB fallback).

Watch-type training CSV: includes vintage positives and modern negatives (including
null effective watch type). Rows are omitted only when watch_type was reviewed
as unknown, or when watch_type_tier is low_ml (unless --include-low-confidence).

Usage:
    cd ml && python data/export.py
    cd ml && python data/export.py --include-low-confidence
"""

import os
import sys
from urllib.parse import urlparse

import mysql.connector
import pandas as pd
from dotenv import load_dotenv

# Load .env from project root (one level above ml/)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

DATA_DIR = os.path.dirname(__file__)

# Per-field confidence thresholds matching lib/classifier/thresholds.ts
THRESHOLDS = {
    "condition": 0.60,
    "watch_type": 0.60,
    "brand": 0.88,
    "reference": 0.88,
}

# DataFrame column names for review reviewed flags (match SQL aliases)
REVIEW_FLAG_COL = {
    "brand": "review_brand_reviewed",
    "reference": "review_reference_reviewed",
    "condition": "review_condition_reviewed",
    "watch_type": "review_watch_type_reviewed",
}


def get_connection():
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print("ERROR: DATABASE_URL not set in .env")
        sys.exit(1)

    parsed = urlparse(url)
    return mysql.connector.connect(
        host=parsed.hostname or "127.0.0.1",
        port=parsed.port or 3306,
        user=parsed.username or "root",
        password=parsed.password or "",
        database=parsed.path.lstrip("/"),
    )


def truthy_review(v) -> bool:
    return v == 1 or v is True


def is_watch_type_review_unknown(row: pd.Series) -> bool:
    """Human reviewed watch type and marked it unknown — exclude from training."""
    if not truthy_review(row.get(REVIEW_FLAG_COL["watch_type"])):
        return False
    v = row.get("review_watch_type")
    return pd.isna(v) or v is None


def export_all():
    include_low = "--include-low-confidence" in sys.argv

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            l.id, l.title, l.description,
            l.brand, l.`reference`, l.`condition`, l.watch_type,
            l.price_cents, l.price_min_cents, l.price_max_cents,
            l.brand_source, l.brand_confidence,
            l.reference_source, l.reference_confidence,
            l.condition_source, l.condition_confidence,
            l.watch_type_source, l.watch_type_confidence,
            l.classifier_source,
            r.brand AS review_brand,
            r.`reference` AS review_reference,
            r.`condition` AS review_condition,
            r.watch_type AS review_watch_type,
            r.brand_reviewed AS review_brand_reviewed,
            r.reference_reviewed AS review_reference_reviewed,
            r.condition_reviewed AS review_condition_reviewed,
            r.watch_type_reviewed AS review_watch_type_reviewed,
            r.price_reviewed AS review_price_reviewed,
            r.price_cents AS review_price_cents,
            r.price_min_cents AS review_price_min_cents,
            r.price_max_cents AS review_price_max_cents
        FROM listings l
        LEFT JOIN listing_label_reviews r ON r.listing_id = l.id
        LEFT JOIN listing_gold_eval ge ON ge.listing_id = l.id
        WHERE ge.listing_id IS NULL
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    df = pd.DataFrame(rows)
    print(f"Exported {len(df)} rows total")

    def effective_brand(row):
        if truthy_review(row.get(REVIEW_FLAG_COL["brand"])):
            return row.get("review_brand")
        return row.get("brand")

    def effective_reference(row):
        if truthy_review(row.get(REVIEW_FLAG_COL["reference"])):
            return row.get("review_reference")
        return row.get("reference")

    def effective_condition(row):
        if truthy_review(row.get(REVIEW_FLAG_COL["condition"])):
            return row.get("review_condition")
        return row.get("condition")

    def effective_watch_type(row):
        if truthy_review(row.get(REVIEW_FLAG_COL["watch_type"])):
            return row.get("review_watch_type")
        return row.get("watch_type")

    def effective_price_cents(row):
        if truthy_review(row.get("review_price_reviewed")):
            return row.get("review_price_cents")
        return row.get("price_cents")

    def effective_price_min_cents(row):
        if truthy_review(row.get("review_price_reviewed")):
            return row.get("review_price_min_cents")
        return row.get("price_min_cents")

    def effective_price_max_cents(row):
        if truthy_review(row.get("review_price_reviewed")):
            return row.get("review_price_max_cents")
        return row.get("price_max_cents")

    df["effective_brand"] = df.apply(effective_brand, axis=1)
    df["effective_reference"] = df.apply(effective_reference, axis=1)
    df["effective_condition"] = df.apply(effective_condition, axis=1)
    df["effective_watch_type"] = df.apply(effective_watch_type, axis=1)
    df["effective_price_cents"] = df.apply(effective_price_cents, axis=1)
    df["effective_price_min_cents"] = df.apply(effective_price_min_cents, axis=1)
    df["effective_price_max_cents"] = df.apply(effective_price_max_cents, axis=1)

    def tier_label_field(field_key: str, row: pd.Series, thresh: float) -> str:
        flag_col = REVIEW_FLAG_COL[field_key]
        if truthy_review(row.get(flag_col)):
            return "gold_manual"
        src_col = f"{field_key}_source"
        src = row.get(src_col)
        conf_col = f"{field_key}_confidence"
        db_val_col = field_key if field_key != "watch_type" else "watch_type"

        if src == "regex":
            return "silver_regex"
        if src in ("local", "ai"):
            conf = row.get(conf_col)
            if conf is not None and float(conf) >= thresh:
                return "bronze_ml"
            return "low_ml"
        if pd.notna(row.get(db_val_col)) and row.get(db_val_col):
            return "legacy_unknown"
        return "unlabeled"

    for fk, thresh in THRESHOLDS.items():
        df[f"{fk}_tier"] = df.apply(lambda r, k=fk, t=thresh: tier_label_field(k, r, t), axis=1)

    def price_tier(row: pd.Series) -> str:
        if truthy_review(row.get("review_price_reviewed")):
            return "gold_manual"
        if pd.notna(row.get("price_cents")) and row.get("price_cents"):
            return "legacy_unknown"
        return "unlabeled"

    df["price_tier"] = df.apply(price_tier, axis=1)

    # Main labeled dataset (all rows, all columns)
    labeled_path = os.path.join(DATA_DIR, "labeled.csv")
    df.to_csv(labeled_path, index=False)
    print(f"  -> {labeled_path}")

    # Condition subset — exclude low-confidence ML unless flagged
    cond_df = df[df["effective_condition"].notna()].copy()
    if not include_low:
        cond_df = cond_df[cond_df["condition_tier"] != "low_ml"]
    cond_df["condition"] = cond_df["effective_condition"]
    cond_path = os.path.join(DATA_DIR, "condition_labeled.csv")
    cond_df.to_csv(cond_path, index=False)
    tier_counts = cond_df["condition_tier"].value_counts().to_dict()
    print(f"  -> {cond_path} ({len(cond_df)} rows, tiers: {tier_counts})")

    # Watch type subset — binary vintage (1) vs modern (0).
    # Include all rows except: (1) human-reviewed unknown watch type, (2) low_ml when filtered.
    # Rows with null effective_watch_type are modern negatives (train_watch_type.py maps non-vintage to modern).
    wt_all = df[~df.apply(is_watch_type_review_unknown, axis=1)].copy()
    if not include_low:
        wt_all = wt_all[wt_all["watch_type_tier"] != "low_ml"]
    wt_all["watch_type_label"] = (wt_all["effective_watch_type"] == "vintage").astype(int)
    # train_watch_type.py expects column `watch_type`: "vintage" vs anything else → modern
    wt_all["watch_type"] = wt_all["effective_watch_type"].apply(
        lambda x: "vintage" if pd.notna(x) and x == "vintage" else "",
    )
    wt_path = os.path.join(DATA_DIR, "watch_type_labeled.csv")
    wt_all.to_csv(wt_path, index=False)
    pos = int(wt_all["watch_type_label"].sum())
    print(f"  -> {wt_path} ({len(wt_all)} rows, {pos} vintage / {len(wt_all) - pos} modern)")

    # Brand subset (non-null effective brand)
    brand_df = df[df["effective_brand"].notna()].copy()
    if not include_low:
        brand_df = brand_df[brand_df["brand_tier"] != "low_ml"]
    brand_df["brand"] = brand_df["effective_brand"]
    brand_path = os.path.join(DATA_DIR, "brand_labeled.csv")
    brand_df.to_csv(brand_path, index=False)
    print(f"  -> {brand_path} ({len(brand_df)} rows, {brand_df['brand'].nunique()} brands)")

    # Reference subset (non-null effective reference)
    ref_df = df[df["effective_reference"].notna()].copy()
    if not include_low:
        ref_df = ref_df[ref_df["reference_tier"] != "low_ml"]
    ref_df["reference"] = ref_df["effective_reference"]
    ref_path = os.path.join(DATA_DIR, "reference_labeled.csv")
    ref_df.to_csv(ref_path, index=False)
    print(f"  -> {ref_path} ({len(ref_df)} rows)")

    print("Done.")


if __name__ == "__main__":
    export_all()
