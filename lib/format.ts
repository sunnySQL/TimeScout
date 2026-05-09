export function formatUsd(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Format a price that might be an exact value, a bounded range, or an
 * open-ended bucket like "Under $X" / "$X+".
 *
 * - Both bounds: "$750–$999"
 * - Only min:    "$10,000+"
 * - Only max:    "under $500"
 * - Neither:     fall back to `exactCents` (source provided one exact value)
 */
export function formatUsdRange(params: {
  exactCents: number | null | undefined;
  minCents: number | null | undefined;
  maxCents: number | null | undefined;
}): string {
  const { exactCents, minCents, maxCents } = params;
  if (minCents != null && maxCents != null) {
    return `${formatUsd(minCents)}–${formatUsd(maxCents)}`;
  }
  if (minCents != null && maxCents == null) {
    return `${formatUsd(minCents)}+`;
  }
  if (minCents == null && maxCents != null) {
    return `under ${formatUsd(maxCents)}`;
  }
  return formatUsd(exactCents);
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const then = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
