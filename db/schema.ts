import {
  bigint,
  boolean,
  decimal,
  index,
  json,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * One row per outbound click from the app to a listing's source page.
 * Kept minimal on purpose; you can add session/user columns later.
 */

/** Where listings are ingested from (Reddit today; more source adapters later). */
export const sources = mysqlTable(
  "sources",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    baseUrl: varchar("base_url", { length: 512 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sources_slug_uq").on(t.slug)],
);

/**
 * Normalized listing row. US-only for now: use `region` for state code when known.
 * Prices stored in minor units (cents) for USD.
 */
export const listings = mysqlTable(
  "listings",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    sourceId: bigint("source_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    /** Stable id from the source API or derived key for dedupe. */
    externalId: varchar("external_id", { length: 191 }).notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    description: text("description"),
    brandRaw: varchar("brand_raw", { length: 128 }),
    modelRaw: varchar("model_raw", { length: 256 }),
    referenceRaw: varchar("reference_raw", { length: 64 }),
    /** Canonical brand after parsing, e.g. "Rolex", "Grand Seiko". */
    brand: varchar("brand", { length: 64 }),
    /** Canonical reference after parsing, e.g. "126610LN". */
    reference: varchar("reference", { length: 64 }),
    priceCents: bigint("price_cents", { mode: "number", unsigned: true }),
    /**
     * When the source gives us a price range (e.g. Reddit flair "$750-$999"),
     * we persist the bounds here. `priceCents` stays populated with the
     * midpoint so sort/filter continues to work on a single column. Consumers
     * that want to render the range as-is should use min/max when set.
     */
    priceMinCents: bigint("price_min_cents", { mode: "number", unsigned: true }),
    priceMaxCents: bigint("price_max_cents", { mode: "number", unsigned: true }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    condition: varchar("condition", { length: 32 }),
    /**
     * Watch style/era classification, separate from condition.
     * Currently: "vintage" — can expand to "pocket", "smartwatch", etc.
     */
    watchType: varchar("watch_type", { length: 32 }),
    /**
     * Confidence (0.00–1.00) when condition / watchType were assigned by the
     * AI classifier. Null for regex-classified or unclassified rows.
     */
    aiConfidence: decimal("ai_confidence", { precision: 3, scale: 2 }),
    /** Timestamp of the most recent AI classification pass for this row. */
    aiClassifiedAt: timestamp("ai_classified_at"),
    /** Confidence (0.00–1.00) from the local TF-IDF+LR classifier. */
    localConfidence: decimal("local_confidence", { precision: 3, scale: 2 }),
    /** Timestamp of the most recent local-model classification pass. */
    localClassifiedAt: timestamp("local_classified_at"),
    /**
     * Which system produced the current condition/watchType/brand/reference
     * values: "regex" | "local" | "ai" | "manual" | "legacy". Null for legacy rows.
     * When multiple systems touch one row, last writer in pipeline order wins.
     * Field-level *_source columns are the source of truth per field.
     */
    classifierSource: varchar("classifier_source", { length: 16 }),
    // ── Per-field provenance ───────────────────────────────────────────
    brandSource: varchar("brand_source", { length: 16 }),
    brandConfidence: decimal("brand_confidence", { precision: 4, scale: 3 }),
    referenceSource: varchar("reference_source", { length: 16 }),
    referenceConfidence: decimal("reference_confidence", { precision: 4, scale: 3 }),
    conditionSource: varchar("condition_source", { length: 16 }),
    conditionConfidence: decimal("condition_confidence", { precision: 4, scale: 3 }),
    watchTypeSource: varchar("watch_type_source", { length: 16 }),
    watchTypeConfidence: decimal("watch_type_confidence", { precision: 4, scale: 3 }),
    listingUrl: varchar("listing_url", { length: 2048 }).notNull(),
    imageUrl: varchar("image_url", { length: 2048 }),
    /** US state code when known, e.g. CA */
    region: varchar("region", { length: 2 }),
    /**
     * True when the listing is a multi-watch bundle / lot / wholesale post.
     * Hidden from search by default because the single-watch data model
     * (one price, one brand, one reference) doesn't describe them well.
     */
    isBundle: boolean("is_bundle").notNull().default(false),
    /**
     * True when we detect the listing has been sold (e.g. Reddit flair
     * flipped to SOLD, title edited to [SOLD], OP comment confirmed sold).
     * Hidden from search by default — sellers rarely delete their posts so
     * stale SOLD listings dominate otherwise.
     */
    isSold: boolean("is_sold").notNull().default(false),
    /**
     * When we first set `is_sold` to true. Used to hide very old sold rows
     * from the grid while keeping the row in the database.
     */
    soldAt: timestamp("sold_at", { mode: "date" }),
    firstSeenAt: timestamp("first_seen_at", { mode: "date" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("listings_source_external_uq").on(t.sourceId, t.externalId),
    index("listings_brand_raw_idx").on(t.brandRaw),
    index("listings_brand_idx").on(t.brand),
    index("listings_reference_idx").on(t.reference),
    index("listings_price_idx").on(t.priceCents),
    index("listings_last_seen_idx").on(t.lastSeenAt),
    index("listings_is_bundle_idx").on(t.isBundle),
    index("listings_is_sold_idx").on(t.isSold),
    index("listings_sold_at_idx").on(t.soldAt),
  ],
);

export const clicks = mysqlTable(
  "clicks",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    listingId: bigint("listing_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    sourceId: bigint("source_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    /** SHA-256 of client IP + daily salt; never the raw IP. */
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    referer: varchar("referer", { length: 512 }),
    /** Optional free-form tag, e.g. "search" or "home". */
    placement: varchar("placement", { length: 32 }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("clicks_listing_idx").on(t.listingId),
    index("clicks_source_idx").on(t.sourceId),
    index("clicks_created_idx").on(t.createdAt),
  ],
);

/**
 * Human-reviewed label overrides. One row per listing. Corrections flow into
 * training export when the matching *_reviewed flag is true (gold tier).
 *
 * Nullable label fields plus *_reviewed=true mean “reviewed as unknown” —
 * export uses null for that field instead of falling back to the listing row.
 *
 * Price overrides use price_reviewed plus optional price_* cents columns;
 * listing rows are only updated when a concrete price or range is supplied —
 * “unknown price” is represented in this table only (does not erase ingest price).
 *
 * bundle_reviewed locks listings.is_bundle against heuristic updates from ingest
 * and backfill:parse once a reviewer sets single vs bundle explicitly.
 *
 * multi_brand_reviewed is queue-only: marks duplicate brand-detector hits as
 * benign copy so rows exit multi-brand / all-flagged scans without touching listings.
 */
export const listingLabelReviews = mysqlTable(
  "listing_label_reviews",
  {
    listingId: bigint("listing_id", { mode: "number", unsigned: true })
      .primaryKey()
      .references(() => listings.id, { onDelete: "cascade" }),
    brand: varchar("brand", { length: 64 }),
    reference: varchar("reference", { length: 64 }),
    condition: varchar("condition", { length: 32 }),
    watchType: varchar("watch_type", { length: 32 }),
    /** True once a reviewer has explicitly submitted this field (including unknown). */
    brandReviewed: boolean("brand_reviewed").notNull().default(false),
    referenceReviewed: boolean("reference_reviewed").notNull().default(false),
    conditionReviewed: boolean("condition_reviewed").notNull().default(false),
    watchTypeReviewed: boolean("watch_type_reviewed").notNull().default(false),
    priceReviewed: boolean("price_reviewed").notNull().default(false),
    /** Review queue only: reviewer acknowledged sold flag (does not change listings.is_sold). */
    soldReviewed: boolean("sold_reviewed").notNull().default(false),
    /** Review queue: low local-confidence warning cleared after review / classification edit. */
    localReviewed: boolean("local_reviewed").notNull().default(false),
    /** Manual bundle flag correction; when true, ingest/backfill must not overwrite listings.is_bundle. */
    bundleReviewed: boolean("bundle_reviewed").notNull().default(false),
    /** Queue-only: reviewer marked extra multi-brand text hits as harmless/noise (trades, bio, etc.). */
    multiBrandReviewed: boolean("multi_brand_reviewed").notNull().default(false),
    /** USD minor units; null when price reviewed as unknown or not yet set. */
    priceCents: bigint("price_cents", { mode: "number", unsigned: true }),
    priceMinCents: bigint("price_min_cents", { mode: "number", unsigned: true }),
    priceMaxCents: bigint("price_max_cents", { mode: "number", unsigned: true }),
    notes: text("notes"),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }).notNull().defaultNow(),
  },
);

/**
 * Human-approved gold labels for offline evaluation only — never merge these into
 * training exports by default (see ml/data/export.py holdout).
 * One row per listing in the eval set; filled manually after curator review.
 */
export const listingGoldEval = mysqlTable(
  "listing_gold_eval",
  {
    listingId: bigint("listing_id", { mode: "number", unsigned: true })
      .primaryKey()
      .references(() => listings.id, { onDelete: "cascade" }),
    brand: varchar("brand", { length: 64 }),
    reference: varchar("reference", { length: 64 }),
    condition: varchar("condition", { length: 32 }),
    watchType: varchar("watch_type", { length: 32 }),
    priceCents: bigint("price_cents", { mode: "number", unsigned: true }),
    priceMinCents: bigint("price_min_cents", { mode: "number", unsigned: true }),
    priceMaxCents: bigint("price_max_cents", { mode: "number", unsigned: true }),
    isBundle: boolean("is_bundle"),
    isSold: boolean("is_sold"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
);

/**
 * Privacy-aware product analytics. Tracks page views, searches, filter
 * applications, and outbound clicks tied to an anonymous session cookie.
 * No raw IPs are stored — only a daily-salted hash for abuse context.
 */
export const analyticsEvents = mysqlTable(
  "analytics_events",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    /** page_view | search | filter_apply | click */
    eventType: varchar("event_type", { length: 32 }).notNull(),
    /** Random UUID from the ts_sid cookie; ties events into sessions. */
    sessionId: varchar("session_id", { length: 64 }),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    referer: varchar("referer", { length: 512 }),
    /** URL path, e.g. "/search" or "/" */
    path: varchar("path", { length: 512 }),
    /** URL query string, e.g. "q=rolex&brand=Rolex" — bounded to 1024 chars. */
    query: varchar("query", { length: 1024 }),
    /** UI placement hint, e.g. "search", "home". */
    placement: varchar("placement", { length: 32 }),
    listingId: bigint("listing_id", { mode: "number", unsigned: true }),
    sourceId: bigint("source_id", { mode: "number", unsigned: true }),
    /** Freeform JSON blob for event-specific metadata (bounded on write). */
    metadataJson: json("metadata_json"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("ae_event_type_idx").on(t.eventType),
    index("ae_session_idx").on(t.sessionId),
    index("ae_created_idx").on(t.createdAt),
    index("ae_listing_idx").on(t.listingId),
    index("ae_source_idx").on(t.sourceId),
  ],
);
