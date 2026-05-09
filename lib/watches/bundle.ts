/**
 * Heuristics for detecting bulk / bundle / wholesale listings.
 *
 * Works on **title + optional body/OP text** so gallery posts and
 * "details in first comment" megathreads are still detected (e.g.
 * "Group timestamp" / "Details (from top left…)" in selftext or OP).
 *
 * Slash-heavy heuristics intentionally use **title only** where possible so
 * URLs in Markdown (`https://…/…`) do not inflate `/` counts.
 *
 * Seller bio phrases (“sell a lot of watches”, “references”, etc.) are masked
 * before keyword checks so colloquial prose does not trigger multi-watch flags.
 *
 * Bare “wholesale” (e.g. pricing language) is ignored unless paired with
 * wholesale+inventory phrases or other multi-watch signals.
 *
 * Trade-preference sections (“Trades: Rolex, AP…”) are stripped before brand
 * co-occurrence checks so swap targets are not mistaken for offered inventory.
 * Reddit paths like `r/tudor` are also masked so shout-outs never count as a second brand hit.
 */

import { parseWatch, listAllBrandHits, stripTradePreferenceSections } from "./parse";

/**
 * "x2" / "x 12" quantity shorthand — not lug dimensions (40 x 48mm),
 * decimals (34.4 x 44.5mm), strap widths (20mm x 18mm), or accessory counts
 * ("links x3", "spring bars x2").
 */
function hasQuantityXCount(t: string): boolean {
  const re = /\bx\s*(\d+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const idx = m.index;
    const before = t.slice(0, idx);
    const after = t.slice(idx + m[0].length);

    // e.g. "34.4 x 44…" — decimal before ×
    if (/\d+(?:\.\d+)?\s*$/.test(before)) continue;

    // e.g. "x 44.5mm" — matched integer continues as decimal measurement
    if (/^\.\d/.test(after)) continue;

    // e.g. "40 x 48mm", "x 48mm case" — unit right after the second number
    if (/^\s*\d+(?:\.\d+)?\s*(?:mm|cm|"|''|in(?:ch|ches)?)\b/.test(after)) continue;

    // e.g. "20mm x 18mm strap"
    if (/(?:mm|cm)\s*$/i.test(before.trimEnd())) continue;

    const lineStart = t.lastIndexOf("\n", idx - 1) + 1;
    const nextNl = t.indexOf("\n", idx);
    const lineEnd = nextNl === -1 ? t.length : nextNl;
    const line = t.slice(lineStart, lineEnd);
    const relIdx = idx - lineStart;
    const tailBefore = line.slice(Math.max(0, relIdx - 80), relIdx);
    const tailTrim = tailBefore.trimEnd();

    // Spare parts / kit — accessory noun immediately before × count
    if (/\bspring\s+bars?\s*$/i.test(tailTrim)) continue;
    if (/\bstrap(?:s)?\s*$/i.test(tailTrim)) continue;
    if (/\blinks?\s*$/i.test(tailTrim)) continue;
    if (/\bbracelet\s*$/i.test(tailTrim)) continue;
    if (/\bbox\s*$/i.test(tailTrim)) continue;
    if (/\bmanual\s*$/i.test(tailTrim)) continue;
    if (/\bpapers\s*$/i.test(tailTrim)) continue;
    if (/\bhang\s+tags?\s*$/i.test(tailTrim)) continue;
    if (/\bclasp(?:es)?\s*$/i.test(tailTrim)) continue;
    if (/\bscrews?\s*$/i.test(tailTrim)) continue;
    if (/\bend\s+links?\s*$/i.test(tailTrim)) continue;

    // "bracelet links – … x3": reject unless a watch/listing token appears after "link(s)"
    const listingAnchorAfterLink =
      /\b(seiko|citizen|casio|omega|rolex|tudor|hamilton|cartier|nomos|oris|zenith|iwc|breitling|panerai|longines|grand\s+seiko|speedmaster|submariner|watch(?:es)?|timepieces?|wts|listing|piece)\b/i;
    const linkMatches = [...tailBefore.matchAll(/\blinks?\b/gi)];
    const lastLink = linkMatches.length > 0 ? linkMatches[linkMatches.length - 1] : undefined;
    if (lastLink != null && lastLink.index !== undefined) {
      const afterLink = tailBefore.slice(lastLink.index + lastLink[0].length);
      if (!listingAnchorAfterLink.test(afterLink)) continue;
    }

    return true;
  }
  return false;
}

/** Strip single-watch accessory / kit bundle phrases before testing bare "bundle". */
const ACCESSORY_BUNDLE_PHRASE =
  /\b(?:bracelet|straps?|leather(?:\s+strap)?|full\s+kit|official|oem)\s+bundle\b|\b(?:bracelet\s*\/\s*strap|strap\s*\/\s*bracelet)\s+bundle\b/g;

const INVENTORY_LOT_PHRASE =
  /\blot\s+of\s+(?:(?:\d+\s+)?(?:watch\s+parts|watch(?:es)?|straps?|parts)\b|\d+(?:\s+[\w'-]+)+\s+watch(?:es)?\b)/;
const INVENTORY_X_LOT = /\b(?:watch|strap|parts)\s+lot\b/;

/**
 * Seller bio / flair prose that mentions selling activity but not multi-watch listings.
 * Applied to lowercased full text before bundle keyword heuristics (not title-only slash counts).
 */
function maskSellerBioNonBundlePhrases(t: string): string {
  return t
    .replace(/\b(?:buys\s+and\s+sells|sell|sells|selling|sold)\s+a\s+lot\s+of\s+watch(?:es)?\b/g, " ")
    .replace(/\ba\s+lot\s+of\s+watch(?:es)?\b/g, " ")
    .replace(/\bwatch\s+nerds?\b/g, " ")
    .replace(/\bdealer\b/g, " ")
    .replace(/\breferences\b/g, " ")
    .replace(/\btransactions\b/g, " ");
}

function bundleWordMeansMultiListing(t: string, fullTextForSale: string): boolean {
  const masked = t.replace(ACCESSORY_BUNDLE_PHRASE, " ");
  if (/\bbundles?\b/.test(masked)) return true;

  if (!/\bwholesale\b/.test(t)) return false;

  if (/\bwholesale\s+(?:lot|bundle|inventory|group)\b/.test(t)) return true;

  const wholesaleWithMultiWatchInventory =
    /\b\d+\s+watches?\b/.test(t) ||
    /\b(?:two|three|four|five|six)\s+watches?\b/.test(t) ||
    hasQuantityXCount(t) ||
    INVENTORY_LOT_PHRASE.test(t) ||
    INVENTORY_X_LOT.test(t);

  if (wholesaleWithMultiWatchInventory) return true;

  const brandsHit = listAllBrandHits(fullTextForSale);
  if (brandsHit.size >= 2 && /[,/+]/.test(fullTextForSale)) return true;

  return false;
}

export function detectBundle(
  title: string,
  ...extras: Array<string | null | undefined>
): boolean {
  const titlePart = (title || "").trim();
  const fullText = [titlePart, ...extras.map((x) => String(x ?? "").trim())]
    .filter(Boolean)
    .join("\n\n");
  if (!fullText) return false;

  /** Title + body with trade-preference sections removed (brand co-occurrence only). */
  const fullTextForSale = stripTradePreferenceSections(fullText).replace(/\br\/[\w-]+\b/gi, " ");

  /** Lowercased — most keyword tests use this (seller-bio phrases stripped). */
  const t = maskSellerBioNonBundlePhrases(fullTextForSale.toLowerCase());

  // Strong lexical signals (anywhere in listing text).
  // Avoid bare `\blot\s+of\b`: it matches inside prose ("a lot of compliments").
  // Only treat "lot of" as inventory when tied to watches/straps/parts (or counted watches).
  // Bare "bundle" often means OEM bracelet+strap kit on one watch — mask those phrases first.
  if (bundleWordMeansMultiListing(t, fullTextForSale)) return true;
  if (INVENTORY_LOT_PHRASE.test(t) || INVENTORY_X_LOT.test(t)) return true;
  if (/\$\d[\d,]*(?:\.\d{2})?\s*\/\s*ea\b/i.test(t)) return true;
  if (/\b(?:a\s+)?couple\s+(?:of\s+)?(?:custom\s+)?pieces\b/i.test(t)) return true;
  if (/\bpackage\s+deal\b/.test(t)) return true;
  if (/\bpair\s+of\b/.test(t)) return true;
  // Common Watchex patterns: "[WTS] Brand … Collection Sale - A/B/C" (multi-watch).
  if (/\bcollection\s+sale\b/.test(t)) return true;
  if (/\binventory\s+sale\b/.test(t)) return true;
  if (/\bgroup\s+sale\b/.test(t)) return true;
  // Multi-watch index posts (body/OP — title often minimal).
  if (/\bgroup\s+timestamp\b/.test(t)) return true;
  if (/\bdetails\s*\([^)]*top\s+left/i.test(t)) return true;
  if (/\bmulti[\s-](?:watch|listing|piece)(?:es)?\b/.test(t)) return true;

  // "3 watches", "four watches", "x2", etc.
  if (/\b\d+\s+watches?\b/.test(t)) return true;
  if (/\b(?:two|three|four|five|six)\s+watches?\b/.test(t)) return true;
  if (/\b(?:two|three|four|five|six)\s+\S+(?:\s+\S+){0,6}\s+watches?\b/i.test(t))
    return true;
  // Integer quantity shorthand (x2 / x 12) — exclude measurement × notation.
  if (hasQuantityXCount(t)) return true;

  // Slash-joined lists like "Rolex/Tudor/Omega" — 3+ slashes in **title**
  // (avoid counting `/` in Imgur/Reddit URLs in the body).
  const slashCount = (titlePart.match(/\//g) || []).length;
  if (slashCount >= 3) return true;

  // "+"-joined brand list: "Rolex 116610 + Omega Speedmaster"
  // Only trust this if we can see two distinct brands on either side.
  if (/\s\+\s/.test(fullTextForSale)) {
    const hits = listAllBrandHits(fullTextForSale);
    if (hits.size >= 2) return true;
  }

  // Two or more distinct known brands anywhere in listing text — gate with
  // separators so we skip "Tudor (no relation to Rolex)" narrative copy.
  const brandsHit = listAllBrandHits(fullTextForSale);
  if (brandsHit.size >= 2) {
    if (/[,/+]/.test(fullTextForSale)) return true;
  }

  return false;
}

/** @deprecated Prefer `detectBundle(title, description)` — title-only misses body-only bundles. */
export function isBundleTitle(title: string): boolean {
  return detectBundle(title);
}

// `parseWatch` is re-exported for callers that already need the parse result.
export { parseWatch };
