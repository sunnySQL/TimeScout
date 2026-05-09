/**
 * Shared text preprocessing for local ML classifiers.
 *
 * CRITICAL: This must mirror ml/preprocess.py exactly.
 * Any divergence causes train/serve skew.
 */

const URL_RE = /https?:\/\/\S+/gi;
const BRACKET_TAG_RE = /\[(?:WTS|WTB|WTT|SOLD|TRADING|TRADE)\]/gi;
const PRICE_RE = /\$[\d,]+(?:\.\d{2})?/g;
const MULTI_SPACE_RE = /\s+/g;

export function normalizeText(
  title: string,
  body?: string | null,
): string {
  const parts = [title];
  if (body) {
    parts.push(body.slice(0, 2000));
  }
  let text = parts.join(" ");

  text = text.toLowerCase();
  text = text.replace(URL_RE, " ");
  text = text.replace(BRACKET_TAG_RE, " ");
  text = text.replace(PRICE_RE, " _PRICE_ ");
  text = text.replace(MULTI_SPACE_RE, " ");
  text = text.trim();
  return text;
}
