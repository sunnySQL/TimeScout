/**
 * Human-facing strings derived from listing parse fields + title fallbacks.
 */

type ParseFields = {
  title: string;
  brand: string | null;
  brandRaw: string | null;
  reference: string | null;
  referenceRaw: string | null;
  modelRaw: string | null;
};

/**
 * Subtitle under the source badge: canonical brand + ref, or raw model text.
 * Returns `null` when nothing reliable was parsed — the card title still
 * carries the full listing text, so we avoid repeating a truncated title here.
 */
export function formatListingParseSubtitle(r: ParseFields): string | null {
  const brandPart = r.brand ?? r.brandRaw;
  const refPart = r.reference ?? r.referenceRaw;
  const main = [brandPart, refPart].filter(Boolean).join(" · ");
  if (main) return main;
  if (r.modelRaw?.trim()) return r.modelRaw.trim();
  return null;
}
