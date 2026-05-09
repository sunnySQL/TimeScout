/**
 * Reddit r/Watchexchange ingestion, as a reusable module.
 *
 * This is called by:
 *   - The CLI script at `scripts/ingest/reddit.ts` (for manual runs).
 *   - The cron-triggered API route at `app/api/cron/ingest/route.ts` (legacy
 *     `/api/cron/ingest-reddit` delegates to the same handler).
 *
 * Price precedence (same for ingest + rescue):
 *   exact USD in title / body / OP comment > Reddit flair price bucket (approximate
 *   midpoint + min/max bounds) > unknown. Flair never overwrites an exact price.
 *   When an exact price is applied, price_min_cents and price_max_cents are cleared.
 *
 * Design notes:
 *   - Ingestion is intentionally *fast* (title + selftext only). Running this
 *     on a 15-minute cron is the primary way we stay fresh.
 *   - Filling in prices or brands that only appear in the submission body or OP
 *     comments requires fetching the thread JSON, which is slow. That work is split
 *     into `rescuePrices` below and typically runs on a separate, slower cron.
 */

import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { listingLabelReviews, listings, sources } from "../../db/schema";
import { classifyListing, isAiAvailable } from "../ai/classify";
import { classifyLocal, isLocalAvailable } from "../ml/index";
import {
  detectSold,
  extractCondition,
  extractWatchType,
  extractFlairPriceRange,
  extractUsdPriceCents,
  extractUsState,
  fetchOpCommentText,
  fetchSubredditPosts,
  isWtsPost,
  type RedditPost,
} from "../reddit/browse";
import { parseWatch } from "../watches/parse";
import { detectBundle } from "../watches/bundle";
import { LOCAL_THRESHOLDS } from "../classifier/thresholds";

export const REDDIT_SOURCE_SLUG = "reddit-watchexchange";

/**
 * When applied via `updateRescuedFields`, sets `price_cents` and explicitly
 * writes min/max (null clears stale flair range bounds after an exact price wins).
 */
export type RescuedPricePatch = {
  cents: number;
  minCents: number | null;
  maxCents: number | null;
};

export type IngestRedditOptions = {
  subreddit?: string;
  /** Number of pages of 100 to fetch. */
  pages?: number;
  /**
   * If true, also fetch OP comments for posts still missing something material:
   * null price/brand/condition **or** a flair-only approximate price (min/max
   * bounds present). Slow.
   */
  fetchComments?: boolean;
  /** Cap on OP-comment fetches per run when `fetchComments` is true. */
  maxCommentFetches?: number;
  /** Delay between OP-comment fetches to respect Reddit's rate limits. */
  commentFetchDelayMs?: number;
  /**
   * If true, run the local TF-IDF+LR classifier on rows where regex
   * returned null for any field. Requires model files in models/.
   * Enabled by default; disable with `--no-local`.
   */
  useLocal?: boolean;
  /** Minimum local-model confidence to persist (0–1). Default 0.55. */
  localMinConfidence?: number;
  /**
   * If true, after regex + local run an LLM classifier on rows that still
   * have null `condition` or `watchType`. Requires OPENAI_API_KEY.
   */
  useAi?: boolean;
  /** Minimum AI confidence to persist (0–1). Default 0.75. */
  aiMinConfidence?: number;
  /** Cap on AI calls per run. Default 200. */
  aiMaxCalls?: number;
};

export type IngestRedditResult = {
  fetched: number;
  wts: number;
  upserted: number;
  pricedFromTitleBody: number;
  pricedAfterComments: number;
  brandParsed: number;
  commentFetchesAttempted: number;
  /** Local ML model calls attempted this run. */
  localCalls: number;
  /** Local ML calls that produced a usable label. */
  localLabeled: number;
  /** AI calls attempted this run (0 unless `useAi: true`). */
  aiCalls: number;
  /** AI calls that produced a usable label above the confidence threshold. */
  aiLabeled: number;
  elapsedMs: number;
};

const DEFAULT_OPTIONS: Required<IngestRedditOptions> = {
  subreddit: "Watchexchange",
  pages: 3,
  fetchComments: false,
  maxCommentFetches: 200,
  commentFetchDelayMs: 1200,
  useLocal: true,
  localMinConfidence: 0.55,
  useAi: false,
  aiMinConfidence: 0.75,
  aiMaxCalls: 200,
};

export async function ingestReddit(
  options: IngestRedditOptions = {},
): Promise<IngestRedditResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const started = Date.now();

  const sourceId = await ensureRedditSource(opts.subreddit);
  const db = getDb();

  const posts = await fetchSubredditPosts({
    subreddit: opts.subreddit,
    pages: opts.pages,
    listing: "new",
  });
  const wts = posts.filter(isWtsPost);

  let upserted = 0;
  let pricedFromTitleBody = 0;
  let brandParsed = 0;
  const rescueCandidates: RedditPost[] = [];
  const rescueSeen = new Set<string>();
  /**
   * Posts that emerged from regex passes still missing BOTH condition and
   * watchType. The optional AI step (later) classifies these from text.
   * We store the OP comment text we already fetched so AI doesn't re-fetch.
   */
  const aiCandidates: Array<{ post: RedditPost; opText: string | null }> = [];
  const aiCandidateSeen = new Set<string>();

  function enqueueCommentRescue(post: RedditPost) {
    if (rescueSeen.has(post.id)) return;
    rescueSeen.add(post.id);
    rescueCandidates.push(post);
  }

  function enqueueAiCandidate(post: RedditPost, opText: string | null = null) {
    if (aiCandidateSeen.has(post.id)) return;
    aiCandidateSeen.add(post.id);
    aiCandidates.push({ post, opText });
  }

  for (const post of wts) {
    const r = await upsertPost(sourceId, post);
    if (!r.ok) continue;
    upserted++;
    if (r.priceCents != null) {
      pricedFromTitleBody++;
    }
    // OP comments often hold the price, brand, or condition details. Fetch when
    // anything important is missing — OR when we only have a flair bucket price
    // (min/max set): OP text may contain an exact price that must replace it.
    const pricedFromFlairApprox =
      r.priceMinCents != null || r.priceMaxCents != null;
    if (
      r.priceCents == null ||
      pricedFromFlairApprox ||
      r.brand == null ||
      r.condition == null
    ) {
      enqueueCommentRescue(post);
    }
    if (r.brand) brandParsed++;
    // Track posts where regex couldn't classify either field — AI candidate.
    if (r.condition == null && r.watchType == null) {
      enqueueAiCandidate(post);
    }
  }

  let pricedAfterComments = pricedFromTitleBody;
  let commentFetchesAttempted = 0;

  if (opts.fetchComments && rescueCandidates.length > 0) {
    const toFetch = rescueCandidates.slice(0, opts.maxCommentFetches);
    for (const post of toFetch) {
      commentFetchesAttempted++;
      try {
        const opText = await fetchOpCommentText({
          subreddit: opts.subreddit,
          postId: post.id,
          author: post.author,
        });
        const exactPriceFromTexts = extractUsdPriceCents(post.title, post.selftext, opText);
        const nowSold = detectSold({
          title: post.title,
          flair: post.linkFlairText,
          opCommentText: opText,
        });
        const parsedFromContext = parseWatchFromTexts(post.title, post.selftext, opText);
        const conditionFromComment = extractCondition(post.title, post.selftext, opText);
        const watchTypeFromComment = extractWatchType(post.title, post.selftext, opText);
        if (
          exactPriceFromTexts != null ||
          nowSold ||
          parsedFromContext.brand != null ||
          parsedFromContext.reference != null ||
          conditionFromComment != null ||
          watchTypeFromComment != null
        ) {
          await updateRescuedFields(sourceId, post.id, {
            pricePatch:
              exactPriceFromTexts != null
                ? {
                    cents: exactPriceFromTexts,
                    minCents: null,
                    maxCents: null,
                  }
                : undefined,
            isSold: nowSold,
            brand: parsedFromContext.brand,
            reference: parsedFromContext.reference,
            condition: conditionFromComment,
            watchType: watchTypeFromComment,
            opComment: opText,
          });
          await refreshListingBundleFlag(sourceId, post.id);
          if (exactPriceFromTexts != null) pricedAfterComments++;
        } else if (opText) {
          // Even if nothing new was found, persist the OP comment text
          // so future backfills and local ML can use it.
          await updateRescuedFields(sourceId, post.id, {
            isSold: false,
            opComment: opText,
          });
          await refreshListingBundleFlag(sourceId, post.id);
        }
        // If regex still couldn't classify after seeing the OP comment, stash
        // the comment text for the AI pass so we don't re-fetch it.
        if (
          conditionFromComment == null &&
          watchTypeFromComment == null &&
          opText
        ) {
          enqueueAiCandidate(post, opText);
        }
      } catch {
        // network flakes shouldn't kill the whole run
      }
      await sleep(opts.commentFetchDelayMs);
    }
  }

  // ── Local ML classifier pass ──────────────────────────────────────────
  let localCalls = 0;
  let localLabeled = 0;
  if (opts.useLocal && isLocalAvailable() && aiCandidates.length > 0) {
    const stillUnclassified: typeof aiCandidates = [];
    for (const item of aiCandidates) {
      localCalls++;
      const local = classifyLocal({
        title: item.post.title,
        body: [item.post.selftext, item.opText]
          .filter((x): x is string => Boolean(x && String(x).trim()))
          .join("\n\n"),
      });

      let labeled = false;
      const set: Record<string, unknown> = {};
      const appliedConfs: number[] = [];

      if (
        local.condition &&
        local.condition.confidence >= LOCAL_THRESHOLDS.condition
      ) {
        set.condition = sql`COALESCE(\`condition\`, ${local.condition.label})`;
        set.conditionSource = sql`COALESCE(condition_source, 'local')`;
        set.conditionConfidence = sql`COALESCE(condition_confidence, ${local.condition.confidence.toFixed(3)})`;
        appliedConfs.push(local.condition.confidence);
        labeled = true;
      }
      if (
        local.watchType &&
        local.watchType.confidence >= LOCAL_THRESHOLDS.watchType
      ) {
        set.watchType = sql`COALESCE(watch_type, ${local.watchType.label})`;
        set.watchTypeSource = sql`COALESCE(watch_type_source, 'local')`;
        set.watchTypeConfidence = sql`COALESCE(watch_type_confidence, ${local.watchType.confidence.toFixed(3)})`;
        appliedConfs.push(local.watchType.confidence);
        labeled = true;
      }
      if (local.brand && local.brand.confidence >= LOCAL_THRESHOLDS.brand) {
        set.brand = sql`COALESCE(brand, ${local.brand.label})`;
        set.brandSource = sql`COALESCE(brand_source, 'local')`;
        set.brandConfidence = sql`COALESCE(brand_confidence, ${local.brand.confidence.toFixed(3)})`;
        appliedConfs.push(local.brand.confidence);
        labeled = true;
      }
      if (
        local.reference &&
        local.reference.confidence >= LOCAL_THRESHOLDS.reference
      ) {
        set.reference = sql`COALESCE(\`reference\`, ${local.reference.label})`;
        set.referenceSource = sql`COALESCE(reference_source, 'local')`;
        set.referenceConfidence = sql`COALESCE(reference_confidence, ${local.reference.confidence.toFixed(3)})`;
        appliedConfs.push(local.reference.confidence);
        labeled = true;
      }

      if (labeled) {
        const minConf = Math.min(...appliedConfs);
        set.localConfidence = minConf.toFixed(2);
        set.localClassifiedAt = new Date();
        set.classifierSource = "local";

        await db
          .update(listings)
          .set(set)
          .where(
            sql`source_id = ${sourceId} AND external_id = ${item.post.id}`,
          );
        localLabeled++;
      } else {
        stillUnclassified.push(item);
      }
    }
    // Narrow the AI candidate list to only what local couldn't handle
    aiCandidates.length = 0;
    aiCandidates.push(...stillUnclassified);
  }

  // ── OpenAI AI classifier pass ────────────────────────────────────────
  let aiCalls = 0;
  let aiLabeled = 0;
  if (opts.useAi && isAiAvailable() && aiCandidates.length > 0) {
    const toClassify = aiCandidates.slice(0, opts.aiMaxCalls);
    for (const { post, opText } of toClassify) {
      aiCalls++;
      const result = await classifyListing({
        title: post.title,
        body: post.selftext,
        opComment: opText,
      });
      if (!result) continue;
      if (result.condition == null && result.watchType == null) continue;
      if (result.confidence < opts.aiMinConfidence) continue;

      await applyAiClassification(sourceId, post.id, result);
      aiLabeled++;
    }
  }

  return {
    fetched: posts.length,
    wts: wts.length,
    upserted,
    pricedFromTitleBody,
    pricedAfterComments,
    brandParsed,
    commentFetchesAttempted,
    localCalls,
    localLabeled,
    aiCalls,
    aiLabeled,
    elapsedMs: Date.now() - started,
  };
}

export type RescuePricesOptions = {
  /** Only look at rows ingested within this many hours. Default 72h. */
  windowHours?: number;
  /** Max rows to process in one run. */
  limit?: number;
  /** Delay between OP-comment fetches. */
  delayMs?: number;
};

export type RescuePricesResult = {
  candidates: number;
  attempted: number;
  rescued: number;
  /** How many rows flipped to is_sold=true during the pass. */
  markedSold: number;
  elapsedMs: number;
};

/**
 * Find recent Reddit listings that still need rescued thread text — missing price
 * and/or parsed brand, OR flair-only price buckets (min/max) where the submission
 * or OP comments may reveal an exact figure — then re-fetch the thread once.
 * run on its own (slower) cron so the fast ingest job isn't blocked by many
 * sequential comment fetches.
 */
export async function rescuePrices(
  options: RescuePricesOptions = {},
): Promise<RescuePricesResult> {
  const windowHours = options.windowHours ?? 72;
  const limit = options.limit ?? 50;
  const delayMs = options.delayMs ?? 1200;
  const started = Date.now();

  const db = getDb();
  const sourceId = await ensureRedditSource("Watchexchange");

  const hoursInt = Math.floor(windowHours);
  // Rows still missing a price *or* a parsed brand *or* condition,
  // or still carrying an approximate flair price, AND whose description is
  // still empty (meaning we haven't run thread rescue yet). After a successful
  // fetch we persist submission selftext ± OP comments (or a "[no comment]"
  // sentinel when the thread has no usable body text) so the row drops out and
  // does not loop forever.
  const candidates = await db
    .select({
      id: listings.id,
      externalId: listings.externalId,
      title: listings.title,
      description: listings.description,
      brand: listings.brand,
      reference: listings.reference,
      priceCents: listings.priceCents,
      priceMinCents: listings.priceMinCents,
      priceMaxCents: listings.priceMaxCents,
      condition: listings.condition,
      watchType: listings.watchType,
      isSold: listings.isSold,
    })
    .from(listings)
    .where(
      and(
        eq(listings.sourceId, sourceId),
        sql`${listings.firstSeenAt} >= (NOW() - INTERVAL ${sql.raw(String(hoursInt))} HOUR)`,
        or(
          isNull(listings.priceCents),
          isNull(listings.brand),
          isNull(listings.condition),
          isNotNull(listings.priceMinCents),
          isNotNull(listings.priceMaxCents),
        ),
        or(isNull(listings.description), eq(listings.description, "")),
      ),
    )
    .limit(limit);

  let attempted = 0;
  let rescued = 0;
  let markedSold = 0;

  for (const row of candidates) {
    attempted++;
    try {
      // One request returns submission + comment tree, so we get flair,
      // OP's text, and sold signals for the cost of a single fetch.
      const fetched = await fetchPostContextByPostId("Watchexchange", row.externalId);
      if (!fetched.ok) {
        await sleep(delayMs);
        continue;
      }

      const rescueTexts = [
        row.title,
        row.description,
        fetched.selfText,
        fetched.opText,
      ];

      const detectedSold = detectSold({
        title: row.title,
        flair: fetched.flair,
        opCommentText: fetched.combinedBodyText || null,
      });
      // Sold is sticky. If it was ever marked true we don't let a stale
      // reflair revive it as an active listing.
      const sold = row.isSold || detectedSold;

      const exactPrice = extractUsdPriceCents(...rescueTexts);
      const flairRange = extractFlairPriceRange(fetched.flair);
      /** Likely exact parse from title/body (no flair bucket columns). */
      const rowLooksExactOnly =
        row.priceCents != null &&
        row.priceMinCents == null &&
        row.priceMaxCents == null;

      let pricePatch: RescuedPricePatch | undefined;
      if (exactPrice != null) {
        pricePatch = {
          cents: exactPrice,
          minCents: null,
          maxCents: null,
        };
      } else if (!rowLooksExactOnly && flairRange != null) {
        // Flair fallback only — never replaces a stored exact-only row when we found no exact string.
        pricePatch = {
          cents: flairRange.midCents,
          minCents: flairRange.minCents,
          maxCents: flairRange.maxCents,
        };
      }

      const parsedFromContext = parseWatchFromTexts(...rescueTexts);
      const brand = row.brand ?? parsedFromContext.brand;
      const reference = row.reference ?? parsedFromContext.reference;
      const condition =
        row.condition ??
        extractCondition(...rescueTexts);
      const watchType =
        row.watchType ??
        extractWatchType(...rescueTexts);

      const hasNewData =
        (sold && !row.isSold) ||
        pricePatch != null ||
        (row.brand == null && brand != null) ||
        (row.reference == null && reference != null) ||
        (row.condition == null && condition != null) ||
        (row.watchType == null && watchType != null);

      const usableSelf = redditThreadBodyUsable(fetched.selfText);
      const usableOp = redditThreadBodyUsable(fetched.opText);
      const persistOpComment = usableOp ? usableOp : usableSelf ? "" : "[no comment]";

      // Successful thread fetch: persist body text or "[no comment]" so the row
      // leaves the rescue queue without looping. Failed fetches skip this entirely.
      await updateRescuedFields(sourceId, row.externalId, {
        pricePatch: hasNewData ? pricePatch : undefined,
        isSold: sold,
        brand: hasNewData ? brand : undefined,
        reference: hasNewData ? reference : undefined,
        condition: hasNewData ? condition : undefined,
        watchType: hasNewData ? watchType : undefined,
        submissionSelftext: usableSelf || null,
        opComment: persistOpComment,
      });
      await refreshListingBundleFlag(sourceId, row.externalId);
      if (pricePatch != null) rescued++;
      if (sold && !row.isSold) markedSold++;
    } catch {
      // ignore and continue
    }
    await sleep(delayMs);
  }

  return {
    candidates: candidates.length,
    attempted,
    rescued,
    markedSold,
    elapsedMs: Date.now() - started,
  };
}

/**
 * Fetch submission selftext, OP top-level comments, and flair in one request,
 * so we can rescue rows we only know by `externalId`.
 *
 * When `ok` is false (HTTP error, network failure, invalid JSON, or no `t3`
 * listing in the payload), callers must not persist `"[no comment]"` — the row
 * should stay eligible for retry.
 */
type FetchPostContextResult = {
  /** False when HTTP failed, JSON was invalid, or the submission listing was missing from the payload. */
  ok: boolean;
  selfText: string;
  opText: string;
  /** Selftext and OP bodies joined (empty string if neither present). */
  combinedBodyText: string;
  flair: string | null;
};

function fetchPostContextFailure(): FetchPostContextResult {
  return {
    ok: false,
    selfText: "",
    opText: "",
    combinedBodyText: "",
    flair: null,
  };
}

async function fetchPostContextByPostId(
  subreddit: string,
  postId: string,
): Promise<FetchPostContextResult> {
  const userAgent = process.env.REDDIT_USER_AGENT || "web:timescout:0.1";
  const url = new URL(
    `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/comments/${encodeURIComponent(postId)}.json`,
  );
  url.searchParams.set("limit", "50");
  url.searchParams.set("depth", "1");
  url.searchParams.set("sort", "top");
  url.searchParams.set("raw_json", "1");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": userAgent },
      cache: "no-store",
    });
  } catch {
    return fetchPostContextFailure();
  }

  if (!res.ok) return fetchPostContextFailure();

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return fetchPostContextFailure();
  }

  if (!Array.isArray(body) || body.length < 1) return fetchPostContextFailure();

  const listingChild = (body[0] as { data?: { children?: unknown[] } })?.data?.children?.[0] as
    | { kind?: string; data?: Record<string, unknown> }
    | undefined;

  if (listingChild?.kind !== "t3" || !listingChild.data || typeof listingChild.data !== "object") {
    return fetchPostContextFailure();
  }

  const postNode = listingChild.data as {
    author?: string;
    link_flair_text?: string | null;
    selftext?: string;
  };

  const flair = postNode.link_flair_text ?? null;
  const selfText = (postNode.selftext ?? "").trim();

  const author = postNode.author;
  const opBodies: string[] = [];
  if (author) {
    const comments =
      (body[1] as { data?: { children?: Array<{ kind?: string; data?: { author?: string; body?: string } }> } })
        ?.data?.children ?? [];
    for (const c of comments) {
      if (c.kind !== "t1") continue;
      if (c.data?.author !== author) continue;
      if (c.data?.body) opBodies.push(c.data.body);
    }
  }

  const opText = opBodies.join("\n\n").trim();
  const combinedBodyText = [selfText, opText].filter(Boolean).join("\n\n");

  return { ok: true, selfText, opText, combinedBodyText, flair };
}

/** Non-empty thread markdown that is not Reddit's placeholder deleted/removed strings. */
function redditThreadBodyUsable(raw: string | null | undefined): string {
  if (raw == null) return "";
  const t = raw.trim();
  if (!t) return "";
  const low = t.toLowerCase();
  if (low === "[deleted]" || low === "[removed]") return "";
  return t;
}

/* --------------------------- private helpers --------------------------- */

async function ensureRedditSource(subreddit: string): Promise<number> {
  const db = getDb();
  await db
    .insert(sources)
    .values({
      slug: REDDIT_SOURCE_SLUG,
      name: `r/${subreddit}`,
      baseUrl: `https://www.reddit.com/r/${subreddit}`,
      isActive: true,
    })
    .onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)` } });

  const [row] = await db
    .select()
    .from(sources)
    .where(sql`slug = ${REDDIT_SOURCE_SLUG}`);
  if (!row) throw new Error("Failed to create source row");
  return row.id;
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWatchFromTexts(
  ...texts: Array<string | null | undefined>
): ReturnType<typeof parseWatch> {
  const combined = texts.filter(Boolean).join(" ");
  const cleaned = cleanTitle(combined).slice(0, 2000);
  if (!cleaned) return { brand: null, reference: null };
  return parseWatch(cleaned);
}

function pickImage(post: RedditPost): string | null {
  if (post.previewImageUrl) return post.previewImageUrl;
  if (post.galleryImageUrls.length > 0) return post.galleryImageUrls[0];
  if (post.thumbnail) return post.thumbnail;
  return null;
}

type UpsertResult = {
  ok: boolean;
  priceCents: number | null;
  /** Set when flair contributed a bucket — drives OP-comment rescue eligibility. */
  priceMinCents: number | null;
  priceMaxCents: number | null;
  brand: string | null;
  isSold: boolean;
  condition?: string | null;
  watchType?: string | null;
};

async function upsertPost(sourceId: number, post: RedditPost): Promise<UpsertResult> {
  const cleaned = cleanTitle(post.title);
  if (!cleaned) {
    return {
      ok: false,
      priceCents: null,
      priceMinCents: null,
      priceMaxCents: null,
      brand: null,
      isSold: false,
      condition: null,
      watchType: null,
    };
  }

  // Exact prices from title/body always win. Flair is a coarse bucket,
  // so we only fall back to it when we found nothing else.
  const exactPrice = extractUsdPriceCents(post.title, post.selftext);
  const flairRange = exactPrice == null ? extractFlairPriceRange(post.linkFlairText) : null;
  const priceCents = exactPrice ?? flairRange?.midCents ?? null;
  const priceMinCents = flairRange?.minCents ?? null;
  const priceMaxCents = flairRange?.maxCents ?? null;

  // Use title + body for parse context so "brand in description" posts can
  // still get identified on first pass.
  const parsed = parseWatchFromTexts(post.title, post.selftext);
  const state = extractUsState(post.title);
  const isBundle = detectBundle(cleaned, post.selftext);
  const isSold = detectSold({
    // We intentionally check the raw title, not `cleaned` — the `[SOLD]`
    // bracket is stripped by `cleanTitle` so the cleaned form can't detect it.
    title: post.title,
    flair: post.linkFlairText,
  });
  // Condition from title + body; OP comment isn't available on first pass
  // (comment rescue will fill it in later if still null).
  const condition = extractCondition(post.title, post.selftext);
  const watchType = extractWatchType(post.title, post.selftext);
  const url = `https://www.reddit.com${post.permalink}`;

  const db = getDb();
  const [existing] = await db
    .select({
      isSold: listings.isSold,
      soldAt: listings.soldAt,
      bundleReviewed: listingLabelReviews.bundleReviewed,
    })
    .from(listings)
    .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
    .where(
      and(eq(listings.sourceId, sourceId), eq(listings.externalId, post.id)),
    )
    .limit(1);
  const preserveBundleManual = Boolean(existing?.bundleReviewed);
  const wasSold = existing?.isSold ?? false;
  const nextSoldAt = !isSold
    ? null
    : wasSold
      ? (existing?.soldAt ?? new Date())
      : new Date();

  await db
    .insert(listings)
    .values({
      sourceId,
      externalId: post.id,
      title: cleaned.slice(0, 512),
      description: post.selftext?.slice(0, 4000) ?? null,
      brand: parsed.brand,
      reference: parsed.reference,
      priceCents: priceCents ?? undefined,
      priceMinCents: priceMinCents ?? undefined,
      priceMaxCents: priceMaxCents ?? undefined,
      currency: "USD",
      condition: condition ?? undefined,
      watchType: watchType ?? undefined,
      classifierSource: (parsed.brand || parsed.reference || condition || watchType) ? "regex" : undefined,
      brandSource: parsed.brand ? "regex" : undefined,
      referenceSource: parsed.reference ? "regex" : undefined,
      conditionSource: condition ? "regex" : undefined,
      watchTypeSource: watchType ? "regex" : undefined,
      listingUrl: url.slice(0, 2048),
      imageUrl: pickImage(post)?.slice(0, 2048) ?? null,
      region: state,
      isBundle,
      isSold,
      soldAt: nextSoldAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        title: sql`VALUES(title)`,
        description: sql`VALUES(description)`,
        brand: sql`COALESCE(VALUES(brand), brand)`,
        reference: sql`COALESCE(VALUES(\`reference\`), \`reference\`)`,
        brandSource: sql`COALESCE(VALUES(brand_source), brand_source)`,
        referenceSource: sql`COALESCE(VALUES(reference_source), reference_source)`,
        // Incoming flair (VALUES min/max present) must not replace an existing
        // exact-only row (single price, no flair bounds). Incoming exact parses
        // always use VALUES(price_*).
        // Preserve stored prices when the recomputed insert row has no price signal (all null).
        // Flair range must not overwrite exact-only rows; exact parse clears min/max via VALUES null.
        priceCents: sql`
          CASE
            WHEN VALUES(price_cents) IS NULL AND VALUES(price_min_cents) IS NULL AND VALUES(price_max_cents) IS NULL
              THEN price_cents
            WHEN VALUES(price_min_cents) IS NOT NULL OR VALUES(price_max_cents) IS NOT NULL THEN
              CASE
                WHEN price_min_cents IS NULL AND price_max_cents IS NULL AND price_cents IS NOT NULL
                THEN price_cents
                ELSE VALUES(price_cents)
              END
            ELSE VALUES(price_cents)
          END`,
        priceMinCents: sql`
          CASE
            WHEN VALUES(price_cents) IS NULL AND VALUES(price_min_cents) IS NULL AND VALUES(price_max_cents) IS NULL
              THEN price_min_cents
            WHEN VALUES(price_min_cents) IS NOT NULL OR VALUES(price_max_cents) IS NOT NULL THEN
              CASE
                WHEN price_min_cents IS NULL AND price_max_cents IS NULL AND price_cents IS NOT NULL
                THEN price_min_cents
                ELSE VALUES(price_min_cents)
              END
            ELSE VALUES(price_min_cents)
          END`,
        priceMaxCents: sql`
          CASE
            WHEN VALUES(price_cents) IS NULL AND VALUES(price_min_cents) IS NULL AND VALUES(price_max_cents) IS NULL
              THEN price_max_cents
            WHEN VALUES(price_min_cents) IS NOT NULL OR VALUES(price_max_cents) IS NOT NULL THEN
              CASE
                WHEN price_min_cents IS NULL AND price_max_cents IS NULL AND price_cents IS NOT NULL
                THEN price_max_cents
                ELSE VALUES(price_max_cents)
              END
            ELSE VALUES(price_max_cents)
          END`,
        condition: sql`COALESCE(VALUES(\`condition\`), \`condition\`)`,
        watchType: sql`COALESCE(VALUES(watch_type), watch_type)`,
        conditionSource: sql`COALESCE(VALUES(condition_source), condition_source)`,
        watchTypeSource: sql`COALESCE(VALUES(watch_type_source), watch_type_source)`,
        classifierSource: sql`COALESCE(VALUES(classifier_source), classifier_source)`,
        listingUrl: sql`VALUES(listing_url)`,
        imageUrl: sql`VALUES(image_url)`,
        region: sql`VALUES(region)`,
        isBundle: preserveBundleManual ? sql`is_bundle` : sql`VALUES(is_bundle)`,
        isSold: sql`VALUES(is_sold)`,
        soldAt: sql`VALUES(sold_at)`,
        lastSeenAt: sql`CURRENT_TIMESTAMP`,
      },
    });

  return {
    ok: true,
    priceCents,
    priceMinCents,
    priceMaxCents,
    brand: parsed.brand,
    isSold,
    condition,
    watchType,
  };
}

/** Re-read stored title + description and recompute `isBundle` after rescued thread text is merged into `description`. */
async function refreshListingBundleFlag(
  sourceId: number,
  externalId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({
      title: listings.title,
      description: listings.description,
      bundleReviewed: listingLabelReviews.bundleReviewed,
    })
    .from(listings)
    .leftJoin(listingLabelReviews, eq(listingLabelReviews.listingId, listings.id))
    .where(and(eq(listings.sourceId, sourceId), eq(listings.externalId, externalId)))
    .limit(1);
  if (!row) return;
  if (Boolean(row.bundleReviewed)) return;
  const isBundle = detectBundle(row.title ?? "", row.description);
  await db
    .update(listings)
    .set({ isBundle })
    .where(and(eq(listings.sourceId, sourceId), eq(listings.externalId, externalId)));
}

async function updateRescuedFields(
  sourceId: number,
  externalId: string,
  fields: {
    /** When set, replaces price columns; null min/max intentionally clear flair bounds. */
    pricePatch?: RescuedPricePatch;
    isSold: boolean;
    brand?: string | null;
    reference?: string | null;
    condition?: string | null;
    watchType?: string | null;
    /** Submission selftext from thread JSON when rescuing; merged into description with OP comments. */
    submissionSelftext?: string | null;
    /** OP comment text to persist into description with selftext when the DB field is empty. */
    opComment?: string | null;
  },
): Promise<void> {
  const db = getDb();
  const [cur] = await db
    .select({ isSold: listings.isSold, soldAt: listings.soldAt })
    .from(listings)
    .where(
      and(eq(listings.sourceId, sourceId), eq(listings.externalId, externalId)),
    )
    .limit(1);
  const wasSold = cur?.isSold ?? false;
  const nextSoldAt = !fields.isSold
    ? null
    : wasSold
      ? (cur?.soldAt ?? new Date())
      : new Date();

  const set: Record<string, number | boolean | string | Date | null | undefined> =
    {
      isSold: fields.isSold,
      soldAt: nextSoldAt,
    };
  if (fields.pricePatch != null) {
    set.priceCents = fields.pricePatch.cents;
    set.priceMinCents = fields.pricePatch.minCents;
    set.priceMaxCents = fields.pricePatch.maxCents;
  }
  if (fields.brand != null) {
    set.brand = fields.brand;
    set.brandSource = "regex";
    set.classifierSource = "regex";
  }
  if (fields.reference != null) {
    set.reference = fields.reference;
    set.referenceSource = "regex";
    set.classifierSource = "regex";
  }
  if (fields.condition != null) {
    set.condition = fields.condition;
    set.conditionSource = "regex";
    set.classifierSource = "regex";
  }
  if (fields.watchType != null) {
    set.watchType = fields.watchType;
    set.watchTypeSource = "regex";
    set.classifierSource = "regex";
  }
  // Persist Reddit selftext plus OP comments in `description` so backfill-parse
  // and local ML see the same thread text used in extractCondition / price parsing.
  const selfPart = (fields.submissionSelftext ?? "").trim();
  const opPart =
    fields.opComment === "[no comment]" ? "" : (fields.opComment ?? "").trim();
  const mergedRescue = [selfPart, opPart].filter(Boolean).join("\n\n");

  if (mergedRescue) {
    const [existing] = await db
      .select({ description: listings.description })
      .from(listings)
      .where(sql`source_id = ${sourceId} AND external_id = ${externalId}`)
      .limit(1);
    const cur = (existing?.description ?? "").trim();
    if (!cur || cur === "[no comment]") {
      set.description = mergedRescue.slice(0, 65535);
    } else {
      let next = cur;
      if (selfPart && !next.includes(selfPart)) {
        next = `${next.trimEnd()}\n\n${selfPart}`;
      }
      if (opPart && !next.includes(opPart)) {
        next = `${next.trimEnd()}\n\n${opPart}`;
      }
      if (next !== cur) {
        set.description = next.slice(0, 65535);
      }
    }
  } else if (fields.opComment === "[no comment]") {
    const [existing] = await db
      .select({ description: listings.description })
      .from(listings)
      .where(sql`source_id = ${sourceId} AND external_id = ${externalId}`)
      .limit(1);
    if (!existing?.description?.trim()) {
      set.description = "[no comment]";
    }
  }
  await db
    .update(listings)
    .set(set)
    .where(sql`source_id = ${sourceId} AND external_id = ${externalId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Apply an AI classification to an existing listing row, but only fill in
 * fields the row hasn't already got. This protects regex-derived values
 * (which we trust more) from being overwritten by the LLM.
 */
async function applyAiClassification(
  sourceId: number,
  externalId: string,
  result: { condition: string | null; watchType: string | null; confidence: number },
): Promise<void> {
  const db = getDb();
  const confStr = result.confidence.toFixed(3);
  const set: Record<string, unknown> = {
    aiConfidence: result.confidence.toFixed(2),
    aiClassifiedAt: new Date(),
    classifierSource: "ai",
  };
  if (result.condition) {
    set.condition = sql`COALESCE(\`condition\`, ${result.condition})`;
    set.conditionSource = sql`COALESCE(condition_source, 'ai')`;
    set.conditionConfidence = sql`COALESCE(condition_confidence, ${confStr})`;
  }
  if (result.watchType) {
    set.watchType = sql`COALESCE(watch_type, ${result.watchType})`;
    set.watchTypeSource = sql`COALESCE(watch_type_source, 'ai')`;
    set.watchTypeConfidence = sql`COALESCE(watch_type_confidence, ${confStr})`;
  }
  await db
    .update(listings)
    .set(set)
    .where(sql`source_id = ${sourceId} AND external_id = ${externalId}`);
}
