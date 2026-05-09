/** Display label for the primary ingest source (matches `sources.name` today). */
export const DEFAULT_LISTING_SOURCE = "r/Watchexchange";

export function dominantSourceName(
  rows: Array<{ sourceName: string }>,
): string {
  if (rows.length === 0) return DEFAULT_LISTING_SOURCE;
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.sourceName, (counts.get(r.sourceName) ?? 0) + 1);
  }
  let best = rows[0].sourceName;
  let bestN = counts.get(best) ?? 0;
  for (const [name, n] of counts) {
    if (n > bestN) {
      best = name;
      bestN = n;
    }
  }
  return best;
}
