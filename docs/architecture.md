# Architecture

A short tour of how data flows through TimeScout. Pair this with the README
and `db/schema.ts` to get the full picture.

---

## High-level shape

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│  Sources    │──►──│  Ingestion   │──►──│  MySQL   │
│  (Reddit)   │     │  scripts     │     │          │
└─────────────┘     └──────────────┘     └────┬─────┘
                                              │
                     ┌────────────────────────▼──────────────────────┐
                     │               Next.js app                     │
                     │                                               │
                     │   /            landing                        │
                     │   /search      server-rendered search + UI    │
                     │   /go/[id]     click logger + 302 redirect    │
                     │   /admin/…     analytics dashboard            │
                     │   /api/health  MySQL ping                     │
                     └──────────────────────┬────────────────────────┘
                                            │
                                         Browser
```

Two independent processes talk to the same MySQL:

1. **Ingestion** — one-shot or scheduled Node scripts under `scripts/` that
   populate `listings`.
2. **Web app** — Next.js server + client that reads `listings` and writes
   `clicks`.

This split is intentional. Ingestion can run on a schedule, fail, retry,
back off — completely independent of user-facing traffic.

---

## Request lifecycles

### Search request (`GET /search?q=speedmaster&brand=Omega`)

1. Next.js parses `searchParams` (promise-based in App Router).
2. `searchListings(params)` in `lib/search.ts` builds a Drizzle query:
   - `q` → `LIKE %q%` across 6 columns (title, brand, reference + raw variants).
   - `brand`, `condition`, `state` → exact match.
   - `minPrice`, `maxPrice` → range on `price_cents`.
   - `sort` → `ORDER BY price_cents | last_seen_at | first_seen_at`.
3. A second query counts total rows for the same filters.
4. `listBrands()` queries distinct parsed brands for the dropdown.
5. The page renders server-side; no client-side JS needed for results.

### Outbound click (`GET /go/123?p=search`)

1. Parse the `id` param; reject anything not a positive integer.
2. Look up the listing + source.
3. Validate `listing_url` is `http://` or `https://`.
4. **Fire-and-forget** insert into `clicks`. Any DB error is logged but
   never blocks the user.
5. 302 → `listing_url`.

The fire-and-forget pattern matters: clicks are important to log but must
never slow down or fail a user's navigation. We accept at-most-once logging
for simplicity.

### Ingestion (`scripts/ingest/*.ts` → `lib/ingest/*`)

Reddit r/Watchexchange is the active supported source today. Chrono24,
Jomashop, and eBay adapters exist as experimental/future source prototypes, but
they are not required for the current app demo.

Each source adapter follows the same contract:

1. **Ensure** a row in `sources` (unique `slug`, human `name`, `base_url`).
2. **Fetch** rows from an API or file the source permits (Reddit JSON in the
   active path; sanctioned APIs/feeds for future adapters).
3. For each listing:
   - Run `parseWatch(title)` (and source-specific hints where useful).
   - Upsert into `listings` on `(source_id, external_id)`, bumping
     `last_seen_at` on duplicates.
4. **Stop** when the upstream returns no further pages / rows.

See `lib/ingest/reddit.ts` for the active implementation. The Chrono24,
Jomashop, and eBay files demonstrate the same adapter shape for future
multi-source expansion.

---

## Data model decisions

### Keep raw + parsed columns side by side

- `brand_raw` / `brand`, `reference_raw` / `reference`.
- Raw data is the source of truth. The parser is allowed to be wrong and to
  evolve — `npm run backfill:parse` can re-derive parsed columns at any
  time without touching source data.

### Price in cents

- Stored as `bigint` unsigned.
- Avoids floating-point surprises; straightforward to format for display.
- USD-only today; when we expand internationally we'll add a `currency`-
  aware conversion layer, but `price_cents` semantics stay the same.

### Dedup key = `(source_id, external_id)`

- Not just `external_id` — different sources reuse id formats.
- Unique index enforces it, and upsert via `ON DUPLICATE KEY UPDATE`
  refreshes mutable fields (`price_cents`, `last_seen_at`, etc).

### `last_seen_at` is the freshness signal

- Not `updated_at` — an item can be re-seen with identical data.
- A scheduled ingestion + a freshness filter in search (`last_seen_at`
  within the stale window) hides quiet listings.
- **`sold_at`** is set the first time `is_sold` becomes true. Default search
  hides all sold rows; with “Include recently sold” on, only sold rows whose
  `sold_at` is within the last **24 hours** appear — older sold rows stay in
  the database for analytics but not in the grid.

### `clicks` over pageviews

- We track outbound intent, not general analytics.
- `ip_hash` (SHA-256 of `ip + YYYY-MM-DD`) gives us "uniques per day"
  without storing PII.
- `placement` is free-form; we plan to seed it with `search`, `home`,
  `email`, `api`.

---

## Folder conventions

- **`app/`** — routes and pages. Server Components by default; no client
  state so far.
- **`lib/`** — pure, testable domain logic. No Next.js imports here.
- **`db/`** — schema and a lazy DB client. Importing `getDb()` is cheap;
  it only creates a pool when first called.
- **`scripts/`** — one-file CLIs runnable via `tsx`. Each loads
  `dotenv/config` on its own.
- **`docs/`** — long-form docs (this file).

---

## Concurrency & performance notes

- **MySQL pool**: `mysql2.createPool(url)` is cached on `globalThis` in
  dev to survive hot reloads. Production reuses a single pool across
  requests.
- **Ingestion is serial** per call (one insert at a time). Fine for MVP
  volumes. If we ever hit limits, batch inserts via a single
  `INSERT … VALUES (…), (…), (…)` are the next step.
- **Search** scales with `LIKE %q%` — OK up to roughly 100k listings on a
  modest MySQL. After that, move to `FULLTEXT` indexes (MySQL 8 supports
  them natively) or a dedicated search engine (Meilisearch / Typesense).
- **Optional adapter token caching**: the legacy eBay scaffold caches OAuth
  tokens in process memory; this is fine for short-lived ingestion jobs if that
  adapter is revived later.

---

## Security posture

- **No raw IPs stored.** IP hashed with a daily-rotating salt.
- **Redirect validation.** Only `http(s)` targets accepted by `/go/[id]`.
- **No user accounts, no payments.** Least-privilege MVP.
- **Admin auth.** `/admin/*` is protected by HTTP Basic Auth when
  `ADMIN_BASIC_USER` and `ADMIN_BASIC_PASS` are set.
- **MySQL access.** A dedicated `timescout` MySQL user is recommended so a
  bug in one app cannot touch another project's schema.

---

## What to change when

| Change                     | Touch these                                              |
| -------------------------- | -------------------------------------------------------- |
| Add a brand / alias        | `lib/watches/parse.ts` → `BRANDS` array                  |
| Add a condition type       | condition parser/model labels, review UI, search UI      |
| Add a search filter        | `lib/search.ts` + `app/search/page.tsx`                  |
| Add a new ingestion source | `lib/<source>/`, `scripts/ingest/<source>.ts`, package.json |
| Rewrite outbound URLs      | `app/go/[id]/route.ts`                                   |
| Expire stale listings      | Filter `last_seen_at > NOW() - INTERVAL N HOUR` in `lib/search.ts` |
