"""
Train a TF-IDF + Logistic Regression binary classifier for watch_type.

Classes: vintage (1) vs not-vintage (0)
Input: normalized title + description text
Output: models/watch_type.json

Usage:
    cd ml && python3 train_watch_type.py
"""

import os
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report

from preprocess import normalize_text
from export_model import export_tfidf_logreg

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "watch_type_labeled.csv")


def main():
    df = pd.read_csv(DATA_PATH)
    df["label"] = df["watch_type"].apply(lambda x: "vintage" if x == "vintage" else "modern")
    print(f"Training rows: {len(df)}")
    print(f"Class distribution:\n{df['label'].value_counts()}\n")

    df["text"] = df.apply(
        lambda r: normalize_text(str(r["title"]), str(r.get("description", "") or "")),
        axis=1,
    )

    X_text = df["text"].values
    y = df["label"].values

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
    scores = cross_val_score(clf, X, y, cv=cv, scoring="f1_macro")
    print(f"5-fold CV macro-F1: {scores.mean():.3f} (+/- {scores.std():.3f})\n")

    clf.fit(X, y)

    y_pred = clf.predict(X)
    print("Full-data classification report:")
    print(classification_report(y, y_pred, target_names=["modern", "vintage"]))

    export_tfidf_logreg(vec, clf, ["modern", "vintage"], "watch_type")
    print("Done.")


if __name__ == "__main__":
    main()
