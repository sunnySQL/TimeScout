/** Default rows-per-page for admin review (must match `parseLimit` fallback). */
export const REVIEW_DEFAULT_LIMIT = 60;

/**
 * Builds the `/admin/review` query string (no leading `?`).
 * Omits `page` when 1, omits `limit` when default, omits `q` when empty — matches server parsing.
 */
export function buildReviewSearchQuery(opts: {
  filter: string;
  page?: number;
  limit?: number;
  /** Empty / whitespace clears `q` from the URL */
  q?: string | null;
}): string {
  const sp = new URLSearchParams();
  sp.set("filter", opts.filter);
  if (opts.page != null && opts.page > 1) sp.set("page", String(opts.page));
  if (opts.limit != null && opts.limit !== REVIEW_DEFAULT_LIMIT) {
    sp.set("limit", String(opts.limit));
  }
  const qq = opts.q?.trim();
  if (qq) sp.set("q", qq);
  return sp.toString();
}
