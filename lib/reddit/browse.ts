/**
 * Minimal unauthenticated Reddit JSON client.
 *
 * We only read public `.json` endpoints — no login, no OAuth. Reddit does
 * require a descriptive User-Agent header, otherwise they'll 429 hard.
 *
 * See https://github.com/reddit-archive/reddit/wiki/API for the API rules.
 */

const DEFAULT_USER_AGENT =
  "web:timescout:0.1 (aggregator for US watch listings)";
const REDDIT_FETCH_TIMEOUT_MS = 15_000;
const REDDIT_MAX_RATE_LIMIT_RETRIES = 3;

export type RedditPost = {
  id: string;
  title: string;
  selftext: string | null;
  permalink: string;
  url: string;
  author: string;
  createdUtc: number;
  linkFlairText: string | null;
  stickied: boolean;
  removedByCategory: string | null;
  isSelf: boolean;
  thumbnail: string | null;
  previewImageUrl: string | null;
  galleryImageUrls: string[];
};

type ListingResponse = {
  data?: {
    children?: Array<{ data: RawRedditPost }>;
    after?: string | null;
    before?: string | null;
  };
};

type RawRedditPost = {
  id: string;
  name: string;
  title: string;
  selftext?: string;
  permalink: string;
  url: string;
  author: string;
  created_utc: number;
  link_flair_text?: string | null;
  stickied?: boolean;
  removed_by_category?: string | null;
  is_self?: boolean;
  thumbnail?: string;
  preview?: {
    images?: Array<{
      source?: { url?: string };
      resolutions?: Array<{ url?: string; width?: number }>;
    }>;
  };
  media_metadata?: Record<
    string,
    {
      status?: string;
      s?: { u?: string };
      p?: Array<{ u?: string; x?: number }>;
    }
  >;
  is_gallery?: boolean;
};

export type FetchSubredditParams = {
  subreddit: string;
  /** Number of pages of 100 to fetch. Default 3. */
  pages?: number;
  /** Listing to fetch: `new` (most useful for ingestion), `hot`, `top`. */
  listing?: "new" | "hot" | "top";
};

/**
 * Walk a subreddit's listing pages and return all posts.
 */
export async function fetchSubredditPosts(
  params: FetchSubredditParams,
): Promise<RedditPost[]> {
  const pages = Math.max(1, Math.min(params.pages ?? 3, 10));
  const listing = params.listing ?? "new";
  const userAgent = process.env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT;
  const posts: RedditPost[] = [];
  let after: string | null | undefined = undefined;
  let rateLimitRetries = 0;

  for (let page = 0; page < pages; page++) {
    const url = new URL(
      `https://www.reddit.com/r/${encodeURIComponent(params.subreddit)}/${listing}.json`,
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("raw_json", "1");
    if (after) url.searchParams.set("after", after);

    const res = await fetchReddit(url, userAgent);

    if (res.status === 429) {
      if (rateLimitRetries >= REDDIT_MAX_RATE_LIMIT_RETRIES) {
        throw new Error(
          `Reddit rate limited listing fetch after ${rateLimitRetries + 1} attempts. Try again later or set a more specific REDDIT_USER_AGENT.`,
        );
      }
      rateLimitRetries++;
      await sleep(retryAfterMs(res));
      page--;
      continue;
    }
    if (!res.ok) {
      throw new Error(`Reddit request failed: ${res.status} ${res.statusText}`);
    }
    rateLimitRetries = 0;

    const body = (await res.json()) as ListingResponse;
    const children = body.data?.children ?? [];
    for (const child of children) {
      posts.push(toPost(child.data));
    }

    after = body.data?.after ?? null;
    if (!after) break;

    // polite pacing: Reddit's informal cap is ~60 req/min
    await sleep(1200);
  }

  return posts;
}

function toPost(raw: RawRedditPost): RedditPost {
  return {
    id: raw.id,
    title: raw.title,
    selftext: raw.selftext ?? null,
    permalink: raw.permalink,
    url: raw.url,
    author: raw.author,
    createdUtc: raw.created_utc,
    linkFlairText: raw.link_flair_text ?? null,
    stickied: Boolean(raw.stickied),
    removedByCategory: raw.removed_by_category ?? null,
    isSelf: Boolean(raw.is_self),
    thumbnail:
      raw.thumbnail && raw.thumbnail.startsWith("http") ? raw.thumbnail : null,
    previewImageUrl: raw.preview?.images?.[0]?.source?.url ?? null,
    galleryImageUrls: extractGalleryImages(raw),
  };
}

function extractGalleryImages(raw: RawRedditPost): string[] {
  if (!raw.is_gallery || !raw.media_metadata) return [];
  const urls: string[] = [];
  for (const item of Object.values(raw.media_metadata)) {
    if (item.status && item.status !== "valid") continue;
    const url = item.s?.u;
    if (url) urls.push(url);
  }
  return urls;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type RedditCommentsResponse = Array<{
  data?: {
    children?: Array<{
      kind?: string;
      data?: {
        author?: string;
        body?: string;
        replies?: RedditCommentsResponse[number] | string;
      };
    }>;
  };
}>;

/**
 * Fetch OP's own comments on a post. Many r/Watchexchange sellers post the
 * price in the first OP comment instead of the body, so we pull just those
 * and concatenate them for price extraction.
 */
export async function fetchOpCommentText(params: {
  subreddit: string;
  postId: string;
  author: string;
}): Promise<string> {
  return fetchOpCommentTextAttempt(params, 0);
}

async function fetchOpCommentTextAttempt(
  params: {
    subreddit: string;
    postId: string;
    author: string;
  },
  rateLimitRetries: number,
): Promise<string> {
  const userAgent = process.env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT;
  const url = new URL(
    `https://www.reddit.com/r/${encodeURIComponent(params.subreddit)}/comments/${encodeURIComponent(params.postId)}.json`,
  );
  url.searchParams.set("limit", "50");
  url.searchParams.set("depth", "1");
  url.searchParams.set("sort", "top");
  url.searchParams.set("raw_json", "1");

  const res = await fetchReddit(url, userAgent);

  if (res.status === 429) {
    if (rateLimitRetries >= REDDIT_MAX_RATE_LIMIT_RETRIES) {
      throw new Error(
        `Reddit rate limited comment fetch after ${rateLimitRetries + 1} attempts. Try again later or set a more specific REDDIT_USER_AGENT.`,
      );
    }
    await sleep(retryAfterMs(res));
    return fetchOpCommentTextAttempt(params, rateLimitRetries + 1);
  }
  if (!res.ok) return "";

  const body = (await res.json()) as RedditCommentsResponse;
  const commentsListing = body[1];
  const children = commentsListing?.data?.children ?? [];

  const opBodies: string[] = [];
  for (const child of children) {
    if (child.kind !== "t1") continue;
    const d = child.data;
    if (!d) continue;
    if (d.author !== params.author) continue;
    if (d.body) opBodies.push(d.body);
  }
  return opBodies.join("\n\n");
}

async function fetchReddit(url: URL, userAgent: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REDDIT_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "User-Agent": userAgent },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function retryAfterMs(res: Response): number {
  const header = res.headers.get("retry-after");
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 60_000);
  }
  return 5000;
}

/**
 * Normalize emoji keycap digits (e.g. "3️⃣" = U+0033 U+FE0F U+20E3) to ASCII digits
 * so price regexes match obfuscated Reddit titles.
 */
function normalizeKeycapDigitsForPrices(text: string): string {
  return text.replace(/(\d)(?:\uFE0F)?\u20E3/g, "$1");
}

/**
 * Extract a USD price in cents from a WTS-style title/body.
 *
 * Handles:
 *   "$3,500"           -> 350000
 *   "$3500 shipped"    -> 350000
 *   "$1,299.00"        -> 129900
 *   "asking 4500"      -> 450000 (when explicitly money-ish)
 *   "Price: 320USD"    -> 32000 (preferred over later "Shipping: $50")
 *   Body "price change: $700" wins over stale title price when present.
 *   "$3️⃣,1️⃣0️⃣0️⃣"      -> 310000 (keycap digits normalized first)
 */
export function extractUsdPriceCents(...texts: Array<string | null | undefined>): number | null {
  const parts = texts.filter(Boolean).map(String);
  const tail = parts.slice(1).join(" \n ");
  if (tail && /\bprice\s+change\b/i.test(tail)) {
    const fromTail = extractUsdPriceCentsFromCombined(tail);
    if (fromTail != null) return fromTail;
  }
  return extractUsdPriceCentsFromCombined(parts.join(" \n "));
}

function extractUsdPriceCentsFromCombined(combined: string): number | null {
  if (!combined) return null;
  combined = normalizeKeycapDigitsForPrices(combined);

  // Prefer explicit "Price:" seller lines over incidental dollar amounts (e.g. shipping rows).
  const priceLabelMatches: RegExp[] = [
    /\bprice\s*:\s*\$?\s*(\d[\d,]*(?:\.\d{2})?)usd\b/i,
    /\bprice\s*:\s*\$?\s*(\d[\d,]*(?:\.\d{2})?)\s+usd\b/i,
    /\bprice\s*:\s*\$\s*(\d[\d,]*(?:\.\d{2})?)\b/i,
    /\bprice\s*:\s*(\d[\d,]*(?:\.\d{2})?)\b/i,
  ];
  for (const pat of priceLabelMatches) {
    const m = combined.match(pat);
    if (!m) continue;
    const num = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(num) && num >= 10 && num < 10_000_000) {
      return Math.round(num * 100);
    }
  }

  // "$4.8k" / "$12k" — Reddit shorthand. Multiply by 1000.
  const kMatch = combined.match(/\$\s*(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    const num = Number(kMatch[1]) * 1000;
    if (Number.isFinite(num) && num > 20 && num < 10_000_000) {
      return Math.round(num * 100);
    }
  }

  // Try comma-formatted first ($3,500 / $12,500.00), then bare digits ($15).
  // Order matters: a bare-digit alternation first would eagerly swallow the
  // first 3 digits of "3500" and give you "$350".
  //
  // The bare-digit form accepts 2–7 digits so accessory listings like
  // "$15 shipped" for a travel case still get a price. We'll filter
  // unreasonable values (< $10) below.
  const dollarPatterns: RegExp[] = [
    /\$\s*(\d{1,3}(?:,\d{3})+(?:\.\d{2})?)/,
    /\$\s*(\d{2,7}(?:\.\d{2})?)/,
    // Postfix dollar sign: "620$" / "15 $"
    /(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{2,7}(?:\.\d{2})?)\s*\$/,
  ];
  for (const pat of dollarPatterns) {
    const m = combined.match(pat);
    if (!m) continue;
    const num = Number(m[1].replace(/,/g, ""));
    // >= 10 filters out "$5 shipping" style noise while still accepting
    // legitimate low-end accessory prices ($12, $15, etc.).
    if (Number.isFinite(num) && num >= 10 && num < 10_000_000) {
      return Math.round(num * 100);
    }
  }

  // Fallback: "asking 4500" / "price: 4500" / "4500 usd" / "4500 shipped" /
  // "4,500 OBO" — money-adjacent numbers without a dollar sign.
  const wordyPatterns: RegExp[] = [
    /\b(?:asking|price|obo|usd|shipped|firm|sale)\b\s*[:\-]?\s*\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{3,7}(?:\.\d{2})?)/i,
    /(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{3,7}(?:\.\d{2})?)\s*(?:usd|shipped|obo|firm)\b/i,
  ];
  for (const pat of wordyPatterns) {
    const m = combined.match(pat);
    if (!m) continue;
    const num = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(num) && num > 50 && num < 10_000_000) {
      return Math.round(num * 100);
    }
  }

  return null;
}

/** A price range parsed from a Reddit flair bucket, all in USD cents. */
export type FlairPriceRange = {
  /** Lower bound of the bucket, in cents. Null if only an upper bound is known. */
  minCents: number | null;
  /** Upper bound of the bucket, in cents. Null if only a lower bound is known. */
  maxCents: number | null;
  /** Representative single value for sort/filter. Always set when a range is found. */
  midCents: number;
};

/**
 * Parse a Reddit post flair as a coarse USD price bucket.
 *
 * r/Watchexchange uses flair like:
 *   "$1000-$1999"  -> min=1000, max=1999, mid=1500
 *   "$500-$999"    -> min=500,  max=999,  mid=750
 *   "Under $500"   -> min=null, max=500,  mid=250 (half of upper bound)
 *   "$10,000+"     -> min=10000, max=null, mid=10000 (no upper cap)
 *
 * Because this is a bucket, callers should only use it as a fallback when no
 * precise price was found in the title/body/comments. Persisting `min` and
 * `max` lets the UI display the original range instead of a misleading
 * single number.
 */
export function extractFlairPriceRange(
  flair: string | null | undefined,
): FlairPriceRange | null {
  if (!flair) return null;
  const f = flair.replace(/,/g, "").toLowerCase();

  // "$X - $Y" or "$X to $Y" — allow optional "k" suffix on either side.
  const rangeMatch = f.match(
    /\$\s*(\d+(?:\.\d+)?)\s*(k)?\s*(?:-|–|—|to)\s*\$?\s*(\d+(?:\.\d+)?)\s*(k)?/,
  );
  if (rangeMatch) {
    const lo = Number(rangeMatch[1]) * (rangeMatch[2] ? 1000 : 1);
    const hi = Number(rangeMatch[3]) * (rangeMatch[4] ? 1000 : 1);
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo && hi < 10_000_000) {
      return {
        minCents: Math.round(lo * 100),
        maxCents: Math.round(hi * 100),
        midCents: Math.round(((lo + hi) / 2) * 100),
      };
    }
  }

  // "Under $500" / "< $500" — upper bound known, no lower.
  const underMatch = f.match(/(?:under|below|<|less than)\s*\$?\s*(\d+(?:\.\d+)?)\s*(k)?/);
  if (underMatch) {
    const hi = Number(underMatch[1]) * (underMatch[2] ? 1000 : 1);
    if (Number.isFinite(hi) && hi > 0 && hi < 10_000_000) {
      return {
        minCents: null,
        maxCents: Math.round(hi * 100),
        midCents: Math.round((hi / 2) * 100),
      };
    }
  }

  // "$10,000+" / "Over $10k" — lower bound known, no upper.
  const overMatch = f.match(/(?:over|above|>|more than)?\s*\$\s*(\d+(?:\.\d+)?)\s*(k)?\s*\+?/);
  if (overMatch && /\+|over|above|>|more than/.test(f)) {
    const lo = Number(overMatch[1]) * (overMatch[2] ? 1000 : 1);
    if (Number.isFinite(lo) && lo > 0 && lo < 10_000_000) {
      return {
        minCents: Math.round(lo * 100),
        maxCents: null,
        midCents: Math.round(lo * 100),
      };
    }
  }

  return null;
}

/**
 * Backwards-compatible helper that returns just the midpoint. Prefer
 * `extractFlairPriceRange` when you want to render the actual bucket.
 */
export function extractFlairPriceCents(
  flair: string | null | undefined,
): number | null {
  return extractFlairPriceRange(flair)?.midCents ?? null;
}

/**
 * Detect whether a Reddit WTS post appears to be sold.
 *
 * Checks all three signals r/Watchexchange sellers actually use:
 *   - `link_flair_text` flipped to SOLD (sometimes "WTS - SOLD", "[SOLD]", etc.)
 *   - Title edited to include [SOLD] / [SOLD PENDING] / "SOLD:"
 *   - OP's own comment text contains a sold confirmation ("sold", "SOLD!",
 *     "thanks, sold", "sold to /u/..."). Matches are word-boundary'd to
 *     avoid false positives from "almost sold on this" etc.
 */
export function detectSold(params: {
  title: string;
  flair: string | null | undefined;
  opCommentText?: string | null | undefined;
}): boolean {
  const { title, flair, opCommentText } = params;

  if (flair && /\bsold\b/i.test(flair)) return true;

  // Title signals: [SOLD], [SOLD PENDING], SOLD:, SOLD -, "- SOLD"
  if (/\[\s*sold(?:\s+pending)?\s*\]/i.test(title)) return true;
  if (/(^|\s)sold\s*[:\-]/i.test(title)) return true;
  if (/[\s\-]sold\s*$/i.test(title.trim())) return true;

  if (opCommentText) {
    if (/\[\s*sold(?:\s+pending)?\s*\]/i.test(opCommentText)) return true;
    // Strong confirmations from OP.
    const normalized = opCommentText.toLowerCase();
    if (/\bsold\s*[!.]/.test(normalized)) return true;
    if (/\bsold\s+to\b/.test(normalized)) return true;
    if (/\bhas\s+been\s+sold\b/.test(normalized)) return true;
    if (/\bthanks[,.!]?\s+sold\b/.test(normalized)) return true;
    if (/^\s*sold\s*$/m.test(normalized)) return true;
  }

  return false;
}

/**
 * Pull a US state code from bracketed prefixes like `[WTS] [CA]` or
 * `[Los Angeles, CA]`. Returns null if nothing recognizable is found.
 */
export function extractUsState(title: string): string | null {
  const bracketRe = /\[([^\]]{1,40})\]/g;
  const match = title.matchAll(bracketRe);
  for (const m of match) {
    const inside = m[1].trim();
    // direct: [CA], [NY]
    if (/^[A-Z]{2}$/.test(inside) && inside !== "WTS") return inside;
    // "City, ST"
    const cs = inside.match(/,\s*([A-Z]{2})\b/);
    if (cs) return cs[1];
  }
  return null;
}

/**
 * Infer a normalized condition bucket from WTS post text (title, body, OP comment).
 *
 * r/Watchexchange sellers use a mix of explicit abbreviations (BNIB, LNIB),
 * community jargon (mint, beater, safe queen), and plain descriptions
 * (lightly used, excellent condition). We bucket into four values that match
 * the search filter:
 *
 *   "unworn"    — never or essentially never worn: BNIB, LNIB, NOS, "never worn"
 *   "excellent" — light use only: mint, near mint, excellent, lightly worn
 *   "used"      — clearly worn: used, very good, daily driver, beater, scratches
 *
 * Note: "vintage" is NOT a condition — use `extractWatchType` for era/style.
 * Returns null when no reliable signal is found.
 */
export type Condition =
  | "unworn"
  | "excellent"
  | "very good"
  | "good"
  | "fair"
  | null;

export function extractCondition(
  ...texts: Array<string | null | undefined>
): Condition {
  const combined = texts.filter(Boolean).join(" ");
  if (!combined) return null;

  // ── Numeric ratings (X/10) — very common on r/Watchexchange ─────────────
  const numericMatch = combined.match(
    /\b(?:condition\s*[:\-–]?\s*)?(\d+(?:\.\d)?)\s*\/\s*10\b/i,
  );
  if (numericMatch) {
    const score = parseFloat(numericMatch[1]);
    if (score >= 10) return "unworn";
    if (score >= 9.5) return "excellent";
    if (score >= 8.5) return "very good";
    if (score >= 7) return "good";
    if (score > 0) return "fair";
  }

  // ── Unworn — never been on a wrist ───────────────────────────────────────
  if (
    /\bBNIB\b/.test(combined) ||
    /\bLNIB\b/.test(combined) ||
    /\bNOS\b/.test(combined) ||
    /\bunworn\b/i.test(combined) ||
    /\bnever[\s-]?(?:really\s+)?worn\b/i.test(combined) ||
    /\bnever[\s-]?(?:really\s+)?used\b/i.test(combined) ||
    /\bunused\b/i.test(combined) ||
    /\bbrand[\s-]new\b/i.test(combined) ||
    /\bnew\s+(?:condition|in\s+box)\b/i.test(combined) ||
    /\bin\s+new\s+condition\b/i.test(combined) ||
    /\bnew[\s/]old\s+stock\b/i.test(combined) ||
    /\btags?\s+(?:still\s+)?attached\b/i.test(combined) ||
    /\bstill\s+in\s+(?:plastic|wrap)\b/i.test(combined) ||
    /\bnever\s+(?:been\s+)?paired\b/i.test(combined)
  ) {
    return "unworn";
  }

  // ── Very good (explicit) — check BEFORE excellent so "very good … like new"
  // doesn't get pulled up to excellent. Sellers who explicitly say "very good"
  // are giving a direct rating that should be honored.
  if (
    /\bvery\s+good\s+(?:pre[\s-]?owned\s+)?condition\b/i.test(combined) ||
    /\bcondition\s*:\s*very\s+good\b/i.test(combined) ||
    /\boverall\s+(?:is\s+)?very\s+good\b/i.test(combined)
  ) {
    return "very good";
  }

  // ── Excellent — worn but near-perfect, no visible damage ─────────────────
  if (
    /\bmint\s+condition\b/i.test(combined) ||
    /\bminty\s+condition\b/i.test(combined) ||
    /\bnear[\s-]mint\b/i.test(combined) ||
    /\bminty\b/i.test(combined) ||
    /\blike[\s-]new\b/i.test(combined) ||
    /\bhardly[\s-](?:worn|used)\b/i.test(combined) ||
    /\brarely[\s-](?:worn|used)\b/i.test(combined) ||
    /\bsafe[\s-]queen\b/i.test(combined) ||
    /\bno\s+(?:visible\s+)?scratches?\b/i.test(combined) ||
    (/\bflawless\b/i.test(combined) && !/\bworn\s+(?:a\s+)?(?:fair|good)\s+(?:bit|amount)\b/i.test(combined)) ||
    /\bpristine\b/i.test(combined) ||
    /\bimmaculate\b/i.test(combined) ||
    /\bperfect\s+condition\b/i.test(combined) ||
    /\bbeautiful\s+(?:\w+\s+)?condition\b/i.test(combined)
  ) {
    return "excellent";
  }

  // ── Very good — light signs of normal use ────────────────────────────────
  if (
    /\bexcellent\s+condition\b/i.test(combined) ||
    /\bexcellent\b/i.test(combined) ||
    /\blightly[\s-](?:worn|used)\b/i.test(combined) ||
    /\blight\s+(?:wear|use|scratches?|scuffs?)\b/i.test(combined) ||
    /\bminimal\s+(?:wear|signs?\s+of\s+wear|scratches?|scuffs?|marks?)\b/i.test(combined) ||
    /\bminor\s+(?:wear|scratches?|scuffs?|marks?|signs?\s+of\s+(?:wear|use))\b/i.test(combined) ||
    /\bvery\s+good\s+condition\b/i.test(combined) ||
    /\bVG\+?\b/.test(combined) ||
    /\bgreat\s+(?:condition|shape)\b/i.test(combined) ||
    /\bwell[\s-](?:maintained|kept|cared[\s-]for)\b/i.test(combined) ||
    /\bclean\s+(?:condition|watch|piece|crystal|dial)\b/i.test(combined) ||
    /\bvery\s+clean\b/i.test(combined) ||
    /\bhairlines?\b/i.test(combined)
  ) {
    return "very good";
  }

  // ── Fair (explicit seller statement) — before broad "scratch on" / good tier
  // so "fair condition … scratch on the crystal" honors the headline rating.
  if (
    /\bin\s+fair\s+condition\b/i.test(combined) ||
    /\bfair\s+condition\b/i.test(combined)
  ) {
    return "fair";
  }

  // ── Good — clear daily-wear marks ────────────────────────────────────────
  if (
    /\bgood\s+(?:condition|shape|original\s+condition)\b/i.test(combined) ||
    /\bcondition\s*:\s*good\b/i.test(combined) ||
    /\boverall\s+(?:is\s+)?good\b/i.test(combined) ||
    /\bnormal\s+(?:wear|use)\b/i.test(combined) ||
    /\bregular\s+(?:wear|use)\b/i.test(combined) ||
    /\bdaily[\s-](?:driver|wear|worn|wearer)\b/i.test(combined) ||
    /\bsome\s+(?:scratches?|scuffs?|wear|marks?)\b/i.test(combined) ||
    /\bwear\s+marks?\b/i.test(combined) ||
    /\bscratches?\s+on\b/i.test(combined) ||
    /\bbeen[\s-]worn\b/i.test(combined) ||
    /\bworn\s+(?:well|daily|regularly|frequently|a\s+fair\s+bit)\b/i.test(combined) ||
    /\beveryday\s+(?:wear|use)\b/i.test(combined) ||
    /\bsigns?\s+of\s+(?:wear|use)\b/i.test(combined) ||
    /\bwell[\s-]worn\b/i.test(combined) ||
    /\bdesk[\s-]?(?:diver|diving)\s+marks?\b/i.test(combined) ||
    /\bdesk[\s-]?diver\b/i.test(combined)
  ) {
    return "good";
  }

  // ── Fair — rough / beater / project ──────────────────────────────────────
  if (
    /\bbeater\b/i.test(combined) ||
    /\bproject\s+watch\b/i.test(combined) ||
    /\bfor\s+parts\b/i.test(combined) ||
    /\bheavy\s+(?:wear|scratches?|use)\b/i.test(combined) ||
    /\bneeds?\s+(?:service|repair|polish)\b/i.test(combined) ||
    /\brough\s+(?:condition|shape)\b/i.test(combined) ||
    /\bworn\s+hard\b/i.test(combined) ||
    /\bfixer[\s-]upper\b/i.test(combined) ||
    /\bdamage[ds]?\b/i.test(combined) ||
    /\bdent(?:s|ed)?\b/i.test(combined) ||
    /\bcracks?\b/i.test(combined) ||
    /\bbroken\b/i.test(combined) ||
    /\bnot\s+(?:running|working|keeping\s+time)\b/i.test(combined) ||
    /\bcrown\s+issues?\b/i.test(combined) ||
    /\brunning\s+issues?\b/i.test(combined) ||
    /\bcrown\s+doesn'?t\b/i.test(combined) ||
    /\b(?:serious\s+)?running\s+problems?\b/i.test(combined)
  ) {
    return "fair";
  }

  return null;
}

/**
 * Detect watch style/era from free-form text.
 * Returns "vintage" when the watch is described as vintage or antique.
 * This is intentionally separate from `extractCondition` — a vintage watch
 * can also be unworn, excellent, or used.
 */
export function extractWatchType(
  ...texts: Array<string | null | undefined>
): "vintage" | null {
  const combined = texts.filter(Boolean).join(" ");
  if (!combined) return null;

  // Strap/dial marketing ("Vintage Style Waffle Strap") is not an era claim.
  const withoutVintageStyle = combined.replace(/\bvintage\s+style\b/gi, " ");

  if (
    /\bvintage\b/i.test(withoutVintageStyle) ||
    /\bantique\b/i.test(combined) ||
    /\bNOS\b/.test(combined)
  ) {
    return "vintage";
  }

  // Model-year cues common on r/Watchexchange single-watch listings (pre-quartz era).
  if (
    /\b(?:193\d|194\d|195\d|196\d|197[0-8]|198[0-5])\b/.test(combined) &&
    /\b(omega|rolex|seiko|tudor|longines|iwc|cartier|hamilton|zenith|jaeger|breitling|movado|zodiac|oris|universal|heuer|timex)\b/i.test(
      combined,
    )
  ) {
    return "vintage";
  }

  return null;
}

function looksDeletedOrRemoved(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  return t === "[deleted]" || t === "[removed]" || t === "deleted" || t === "removed";
}

/** True if a post looks like a WTS (want-to-sell) listing. */
export function isWtsPost(post: RedditPost): boolean {
  if (post.stickied) return false;
  if (post.removedByCategory) return false;
  if (looksDeletedOrRemoved(post.author)) return false;
  if (looksDeletedOrRemoved(post.title)) return false;
  if (looksDeletedOrRemoved(post.selftext)) return false;
  if ((post.linkFlairText ?? "").toUpperCase() === "WTS") return true;
  return /^\s*\[wts\]/i.test(post.title);
}
