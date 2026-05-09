"""
Train a binary TF-IDF + LR classifier for brand disambiguation.

For each labeled listing, the true brand is a positive pair (text, brand) → 1.
We sample 3 random wrong brands per row as negative pairs → 0. This creates
a dataset where the model learns "does brand X actually appear / belong in
this listing text?" rather than doing 93-way classification.

At inference time, the existing regex/dictionary produces candidate brands;
this model scores each candidate and picks the highest-confidence match.

Output: models/brand_disambiguator.json

Usage:
    cd ml && python3 train_brand_disambiguator.py
"""

import os
import random

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report

from preprocess import normalize_text
from export_model import export_tfidf_logreg

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "brand_labeled.csv")
NEGATIVES_PER_ROW = 3

random.seed(42)
np.random.seed(42)


def main():
    df = pd.read_csv(DATA_PATH)
    all_brands = sorted(df["brand"].dropna().unique().tolist())
    print(f"Source rows: {len(df)}, unique brands: {len(all_brands)}")

    pairs = []
    for _, row in df.iterrows():
        text = normalize_text(str(row["title"]), str(row.get("description", "") or ""))
        true_brand = row["brand"]

        # Positive: text + true brand
        pairs.append((f"{text} __BRAND__ {true_brand.lower()}", 1))

        # Negatives: text + random wrong brands
        negatives = [b for b in all_brands if b != true_brand]
        chosen = random.sample(negatives, min(NEGATIVES_PER_ROW, len(negatives)))
        for wrong in chosen:
            pairs.append((f"{text} __BRAND__ {wrong.lower()}", 0))

    X_text = [p[0] for p in pairs]
    y = np.array([p[1] for p in pairs])
    print(f"Training pairs: {len(pairs)} (pos={y.sum()}, neg={len(y) - y.sum()})")

    vec = TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=2,
        max_df=0.95,
        sublinear_tf=True,
        strip_accents="unicode",
    )
    X = vec.fit_transform(X_text)

    clf = LogisticRegression(
        max_iter=1000,
        C=1.0,
        class_weight="balanced",
        solver="lbfgs",
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scores = cross_val_score(clf, X, y, cv=cv, scoring="f1")
    print(f"5-fold CV F1: {scores.mean():.3f} (+/- {scores.std():.3f})\n")

    clf.fit(X, y)

    y_pred = clf.predict(X)
    print("Full-data classification report:")
    print(classification_report(y, y_pred, target_names=["wrong_brand", "correct_brand"]))

    export_tfidf_logreg(vec, clf, ["wrong_brand", "correct_brand"], "brand_disambiguator")
    print("Done.")


if __name__ == "__main__":
    main()
