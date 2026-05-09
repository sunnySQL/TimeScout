"""
Evaluation harness for all four classifiers.

Runs stratified holdout evaluation (80/20 split) for each model,
computes confusion matrices, precision/recall/F1, and writes a
summary report to ml/eval_report.txt.

Also exports a sample of 100 random holdout rows per field to
ml/data/holdout_*.csv for manual review (hand-validation).

Usage:
    cd ml && python3 eval.py
"""

import os
import random

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix

from preprocess import normalize_text

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
OUT_DIR = os.path.dirname(__file__)

random.seed(42)
np.random.seed(42)


def eval_condition():
    df = pd.read_csv(os.path.join(DATA_DIR, "condition_labeled.csv"))
    all_classes = ["unworn", "excellent", "very good", "good", "fair"]
    df = df[df["condition"].isin(all_classes)].copy()
    df["text"] = df.apply(
        lambda r: normalize_text(str(r["title"]), str(r.get("description", "") or "")),
        axis=1,
    )

    # Drop classes with <2 samples (can't stratify-split them)
    counts = df["condition"].value_counts()
    usable = [c for c in all_classes if counts.get(c, 0) >= 2]
    df = df[df["condition"].isin(usable)].copy()
    print(f"  Condition eval using classes: {usable} ({len(df)} rows)")

    X_train, X_test, y_train, y_test = train_test_split(
        df["text"].values, df["condition"].values,
        test_size=0.2, stratify=df["condition"].values, random_state=42,
    )

    vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.95, sublinear_tf=True, strip_accents="unicode")
    X_tr = vec.fit_transform(X_train)
    X_te = vec.transform(X_test)

    clf = LogisticRegression(max_iter=1000, C=1.0, class_weight="balanced", solver="lbfgs")
    clf.fit(X_tr, y_train)
    y_pred = clf.predict(X_te)

    # Only report on classes actually present in the test set
    present = sorted(set(y_test) | set(y_pred))
    report = classification_report(y_test, y_pred, labels=present, target_names=present)
    cm = confusion_matrix(y_test, y_pred, labels=present)

    holdout_df = pd.DataFrame({"text": X_test, "true": y_test, "predicted": y_pred})
    holdout_df.to_csv(os.path.join(DATA_DIR, "holdout_condition.csv"), index=False)

    return "CONDITION CLASSIFIER", report, cm, present


def eval_watch_type():
    df = pd.read_csv(os.path.join(DATA_DIR, "watch_type_labeled.csv"))
    df["label"] = df["watch_type"].apply(lambda x: "vintage" if x == "vintage" else "modern")
    df["text"] = df.apply(
        lambda r: normalize_text(str(r["title"]), str(r.get("description", "") or "")),
        axis=1,
    )

    X_train, X_test, y_train, y_test = train_test_split(
        df["text"].values, df["label"].values,
        test_size=0.2, stratify=df["label"].values, random_state=42,
    )

    vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.95, sublinear_tf=True, strip_accents="unicode")
    X_tr = vec.fit_transform(X_train)
    X_te = vec.transform(X_test)

    clf = LogisticRegression(max_iter=1000, C=1.0, class_weight="balanced", solver="lbfgs")
    clf.fit(X_tr, y_train)
    y_pred = clf.predict(X_te)

    classes = ["modern", "vintage"]
    report = classification_report(y_test, y_pred, target_names=classes)
    cm = confusion_matrix(y_test, y_pred, labels=classes)

    holdout_df = pd.DataFrame({"text": X_test, "true": y_test, "predicted": y_pred})
    holdout_df.to_csv(os.path.join(DATA_DIR, "holdout_watch_type.csv"), index=False)

    return "WATCH_TYPE CLASSIFIER", report, cm, classes


def eval_brand_disambiguator():
    df = pd.read_csv(os.path.join(DATA_DIR, "brand_labeled.csv"))
    all_brands = sorted(df["brand"].dropna().unique().tolist())

    pairs = []
    for _, row in df.iterrows():
        text = normalize_text(str(row["title"]), str(row.get("description", "") or ""))
        true_brand = row["brand"]
        pairs.append((f"{text} __BRAND__ {true_brand.lower()}", 1))
        negatives = [b for b in all_brands if b != true_brand]
        chosen = random.sample(negatives, min(3, len(negatives)))
        for wrong in chosen:
            pairs.append((f"{text} __BRAND__ {wrong.lower()}", 0))

    X_text = [p[0] for p in pairs]
    y = np.array([p[1] for p in pairs])

    X_train, X_test, y_train, y_test = train_test_split(
        X_text, y, test_size=0.2, stratify=y, random_state=42,
    )

    vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.95, sublinear_tf=True, strip_accents="unicode")
    X_tr = vec.fit_transform(X_train)
    X_te = vec.transform(X_test)

    clf = LogisticRegression(max_iter=1000, C=1.0, class_weight="balanced", solver="lbfgs")
    clf.fit(X_tr, y_train)
    y_pred = clf.predict(X_te)

    classes_str = ["wrong_brand", "correct_brand"]
    report = classification_report(y_test, y_pred, target_names=classes_str)
    cm = confusion_matrix(y_test, y_pred, labels=[0, 1])

    return "BRAND DISAMBIGUATOR", report, cm, classes_str


def eval_reference_scorer():
    import re

    df = pd.read_csv(os.path.join(DATA_DIR, "reference_labeled.csv"))
    df = df[df["reference"].notna()].copy()

    ref_patterns = [
        re.compile(r"\b\d{4,6}[A-Z]{0,4}(?:-\d{1,4})?\b"),
        re.compile(r"\b[A-Z]{2,4}\d{3,6}[A-Z0-9]*\b"),
        re.compile(r"\b\d{3,5}-\d{3,5}[A-Z0-9]*\b"),
    ]

    pairs = []
    for _, row in df.iterrows():
        text = normalize_text(str(row["title"]), str(row.get("description", "") or ""))
        true_ref = str(row["reference"]).strip()
        raw_title = str(row["title"])

        candidates = set()
        for pat in ref_patterns:
            for m in pat.finditer(raw_title):
                token = m.group()
                if re.match(r"^(19|20)\d{2}$", token):
                    continue
                if len(token) >= 3:
                    candidates.add(token)

        if not candidates:
            continue

        for cand in sorted(candidates):
            label = 1 if cand.upper() == true_ref.upper() else 0
            pairs.append((f"{text} __REF__ {cand.lower()}", label))

    if not pairs or sum(p[1] for p in pairs) < 5:
        return "REFERENCE SCORER", "Insufficient positive examples", None, []

    X_text = [p[0] for p in pairs]
    y = np.array([p[1] for p in pairs])

    X_train, X_test, y_train, y_test = train_test_split(
        X_text, y, test_size=0.2, stratify=y, random_state=42,
    )

    vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.95, sublinear_tf=True, strip_accents="unicode")
    X_tr = vec.fit_transform(X_train)
    X_te = vec.transform(X_test)

    clf = LogisticRegression(max_iter=1000, C=1.0, class_weight="balanced", solver="lbfgs")
    clf.fit(X_tr, y_train)
    y_pred = clf.predict(X_te)

    classes_str = ["wrong_ref", "correct_ref"]
    report = classification_report(y_test, y_pred, target_names=classes_str)
    cm = confusion_matrix(y_test, y_pred, labels=[0, 1])

    return "REFERENCE SCORER", report, cm, classes_str


def main():
    evals = [eval_condition(), eval_watch_type(), eval_brand_disambiguator(), eval_reference_scorer()]

    lines = ["=" * 60, "CLASSIFIER EVALUATION REPORT", "=" * 60, ""]

    for title, report, cm, classes in evals:
        lines.append(f"\n{'─' * 60}")
        lines.append(title)
        lines.append(f"{'─' * 60}\n")
        lines.append(report)
        if cm is not None:
            lines.append("\nConfusion matrix:")
            header = "".join(f"{c:>14}" for c in classes)
            lines.append(f"{'predicted →':>14}{header}")
            for i, row_label in enumerate(classes):
                vals = "".join(f"{cm[i][j]:>14}" for j in range(len(classes)))
                lines.append(f"{'true: ' + row_label:>14}{vals}")
        lines.append("")

    report_text = "\n".join(lines)
    print(report_text)

    report_path = os.path.join(OUT_DIR, "eval_report.txt")
    with open(report_path, "w") as f:
        f.write(report_text)
    print(f"\nReport saved to {report_path}")


if __name__ == "__main__":
    main()
