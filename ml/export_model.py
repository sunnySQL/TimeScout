"""
Shared utility: serialize a sklearn TfidfVectorizer + LogisticRegression
pipeline to a JSON file that the TypeScript runtime can load directly.
"""

import json
import os
import numpy as np

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


def export_tfidf_logreg(
    vectorizer,
    classifier,
    classes: list[str],
    output_name: str,
    *,
    ngram_range: tuple[int, int] = (1, 2),
    min_df: int = 2,
):
    """Write a JSON model artifact to models/<output_name>.json."""
    os.makedirs(MODELS_DIR, exist_ok=True)

    vocab = vectorizer.vocabulary_
    idf = vectorizer.idf_.tolist()

    coef = classifier.coef_
    if coef.ndim == 1:
        coef = coef.reshape(1, -1)
    intercept = classifier.intercept_
    if isinstance(intercept, np.ndarray):
        intercept = intercept.tolist()
    else:
        intercept = [float(intercept)]

    model = {
        "type": "tfidf_logreg",
        "version": 1,
        "preprocessing": {
            "lowercase": True,
            "ngram_range": list(ngram_range),
            "min_df": min_df,
        },
        "vocabulary": vocab,
        "idf": idf,
        "classes": classes,
        "coef": coef.tolist(),
        "intercept": intercept,
    }

    path = os.path.join(MODELS_DIR, f"{output_name}.json")
    with open(path, "w") as f:
        json.dump(model, f, separators=(",", ":"))

    size_kb = os.path.getsize(path) / 1024
    print(f"  -> {path} ({size_kb:.1f} KB, vocab={len(vocab)}, classes={classes})")
    return path
