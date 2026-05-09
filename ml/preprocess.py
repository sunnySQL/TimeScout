"""
Shared text preprocessing for training and inference.

CRITICAL: The TS port at lib/ml/features.ts MUST mirror this logic exactly,
character-for-character. Any divergence means train/serve skew.
"""

import re

# Compiled patterns
_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
_BRACKET_TAG_RE = re.compile(r"\[(?:WTS|WTB|WTT|SOLD|TRADING|TRADE)\]", re.IGNORECASE)
_PRICE_RE = re.compile(r"\$[\d,]+(?:\.\d{2})?")
_MULTI_SPACE_RE = re.compile(r"\s+")


def normalize_text(title: str, body: str | None = None) -> str:
    """Produce a single cleaned string from title + body for TF-IDF input."""
    parts = [title]
    if body:
        parts.append(body[:2000])
    text = " ".join(parts)

    text = text.lower()
    text = _URL_RE.sub(" ", text)
    text = _BRACKET_TAG_RE.sub(" ", text)
    text = _PRICE_RE.sub(" _PRICE_ ", text)
    text = _MULTI_SPACE_RE.sub(" ", text)
    text = text.strip()
    return text
