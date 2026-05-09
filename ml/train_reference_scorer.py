"""
Train a binary classifier that scores reference number candidates.

For each row with a known reference, we generate reference-shaped candidate
tokens from the title text. The token matching the true reference is positive;
all other candidates are negative.

The text feature includes the original listing text plus the candidate token
itself, so the model can learn contextual cues (e.g. "ref." or "caliber"
before a number, brand context, etc.).

Output: models/reference_scorer.json

Usage:
    cd ml && python3 train_reference_scorer.py
"""

import os
import re
import random

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report

from preprocess import normalize_text
from export_model import export_tfidf_logreg

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "reference_labeled.csv")

# Patterns that look like reference numbers
REF_PATTERNS = [
    re.compile(r"\b\d{4,6}[A-Z]{0,4}(?:-\d{1,4})?\b"),
    re.compile(r"\b[A-Z]{2,4}\d{3,6}[A-Z0-9]*\b"),
    re.compile(r"\b\d{3,5}-\d{3,5}[A-Z0-9]*\b"),
]

random.seed(42)
np.random.seed(42)


def find_ref_candidates(text: str) -> list[str]:
    """Extract all reference-shaped tokens from text."""
    candidates = set()
    for pat in REF_PATTERNS:
        for m in pat.finditer(text):
            token = m.group()
            # Filter out year-like (1900-2099) and price-like numbers
            if re.match(r"^(19|20)\d{2}$", token):
                continue
            if len(token) < 3:
                continue
            candidates.add(token)
    return sorted(candidates)


def main():
    df = pd.read_csv(DATA_PATH)
    df = df[df["reference"].notna()].copy()
    print(f"Source rows with references: {len(df)}")

    pairs = []
    skipped = 0
    for _, row in df.iterrows():
        text = normalize_text(str(row["title"]), str(row.get("description", "") or ""))
        true_ref = str(row["reference"]).strip()
        raw_title = str(row["title"])

        candidates = find_ref_candidates(raw_title)
        if not candidates:
            skipped += 1
            continue

        for cand in candidates:
            label = 1 if cand.upper() == true_ref.upper() else 0
            pairs.append((f"{text} __REF__ {cand.lower()}", label))

    print(f"Skipped (no candidates): {skipped}")
    X_text = [p[0] for p in pairs]
    y = np.array([p[1] for p in pairs])
    print(f"Training pairs: {len(pairs)} (pos={y.sum()}, neg={len(y) - y.sum()})")

    if y.sum() < 10:
        print("Not enough positive examples. Aborting.")
        return

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

    cv = StratifiedKFold(n_splits=min(5, int(y.sum())), shuffle=True, random_state=42)
    scores = cross_val_score(clf, X, y, cv=cv, scoring="f1")
    print(f"5-fold CV F1: {scores.mean():.3f} (+/- {scores.std():.3f})\n")

    clf.fit(X, y)

    y_pred = clf.predict(X)
    print("Full-data classification report:")
    print(classification_report(y, y_pred, target_names=["wrong_ref", "correct_ref"]))

    export_tfidf_logreg(vec, clf, ["wrong_ref", "correct_ref"], "reference_scorer")
    print("Done.")


if __name__ == "__main__":
    main()
