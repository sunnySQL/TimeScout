# TimeScout

A search aggregator for watch listings. Think AutoTempest, but for watches —
pull listings from multiple marketplaces into one searchable index and deep
link users out to the original source.

**Scope (MVP):** US only, web only, single solo developer. The active source
today is Reddit r/Watchexchange; the codebase keeps experimental source adapters
for future marketplace expansion.

---

## Project Snapshot

**Problem:** watch marketplace listings are scattered across sources and, on
Reddit in particular, sellers write free-form posts with inconsistent brands,
references, prices, condition language, sold updates, and bundle wording.

**Solution:** TimeScout ingests marketplace listings, preserves raw source text,
normalizes key fields into MySQL, and exposes both a public search experience
and an admin review workflow for improving parser/model quality over time.

The current system is intentionally hybrid:

| Automated | Human-reviewed |
| --------- | -------------- |
| Reddit ingest, dedupe, freshness, sold detection, price extraction, brand/reference parsing, bundle heuristics, local ML classification, optional OpenAI fallback | Admin review queues, reviewed-unknown labels, bundle/sold edge cases, multi-brand false positives, low-confidence rows, gold evaluation set |

---

## Technical Highlights

- **Full-stack marketplace app** with Next.js App Router, TypeScript, MySQL,
  Drizzle ORM, admin pages, search filters, click tracking, and cron endpoints.
- **Messy-text extraction pipeline** combining Reddit title/body/OP-comment
  parsing, regex rules, field provenance, local TF-IDF + Logistic Regression
  models, and optional OpenAI classification.
- **Human-in-the-loop data quality tools** including review queues, session
  review counts, reviewed-unknown handling, bundle/sold overrides, multi-brand
  review clearing, data-health pages, and gold evaluation cases.
- **Retraining/backfill workflow** that exports labels from MySQL, trains Python
  scikit-learn models, serializes JSON artifacts, and runs TypeScript inference
  at app runtime with no Python dependency.
- **Production-minded ingestion** with idempotent upserts, scheduled cron routes,
  stale listing handling, Reddit price rescue, admin auth, and privacy-aware
  analytics.

---

## Source Status

TimeScout is built around a multi-source data model, but the current product
focus is Reddit marketplace ingestion.

| Source | Status | Notes |
| ------ | ------ | ----- |
| Reddit r/Watchexchange | Active | Main supported ingest path and the source used for parser/model development. |
| Chrono24 via Retailed | Experimental adapter | Kept as a source-integration prototype; not part of the current public demo. |
| Jomashop feed | Experimental adapter | Feed parser exists for future affiliate/source work; not currently the active data source. |
| eBay Browse API | Legacy scaffold | Earlier ingest experiment; retained to show source extensibility, not the current plan dependency. |

---

## Screenshots

Screenshots will live under `public/screenshots/` before publishing:

- Search results page
- Admin review queue
- Data health dashboard
- Gold evaluation workflow

---

## Current Model Results

Latest holdout report: `ml/eval_report.txt`.

| Model | Purpose | Current result | Notes |
| ----- | ------- | -------------- | ----- |
| Condition | `unworn`, `excellent`, `very good`, `good`, `fair` | 0.55 macro F1 / 0.70 accuracy | Improving, but adjacent condition tiers are inherently subjective. |
| Watch type | `modern` vs `vintage` | 0.89 macro F1 / 0.93 accuracy | Strongest current classifier. |
| Brand disambiguator | Choose correct brand among parser candidates | 0.46 macro F1 / 0.54 accuracy | Noisy because seller bios, trades, examples, and comparisons mention many brands. |
| Reference scorer | Choose correct reference among candidates | 0.65 macro F1 / 0.73 accuracy | Useful, but still needs gold eval coverage for edge cases. |

These scores are intentionally shown honestly: the app is a working data product
around messy marketplace text, not a clean benchmark dataset.

---

## Stack

| Layer       | Choice                                   |
| ----------- | ---------------------------------------- |
| Framework   | Next.js 15 (App Router, TypeScript)      |
| Styling     | Tailwind CSS v4                          |
| Database    | MySQL 8 via `mysql2`                     |
| ORM         | Drizzle ORM + Drizzle Kit                |
| Runtime     | Node 22+                                 |
| Package mgr | npm                                      |

---

## Prerequisites

- **Node.js 22+** (`brew install node`)
- **MySQL 8** running locally on `:3306` (any setup is fine — MySQL Workbench,
  Docker, or a Homebrew install)
- An empty schema named `timescout`

```sql
CREATE DATABASE IF NOT EXISTS timescout
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
```

Optionally, a dedicated MySQL user:

```sql
CREATE USER 'timescout'@'localhost' IDENTIFIED BY 'your-password';
GRANT ALL PRIVILEGES ON timescout.* TO 'timescout'@'localhost';
FLUSH PRIVILEGES;
```

---

## First-time setup

```bash
git clone ...   # or just cd into the project
cd TimeScout

cp .env.example .env
# edit .env and set DATABASE_URL

npm install
npm run db:push     # creates `sources`, `listings`, `clicks`
npm run seed        # inserts 20 demo listings for local dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Health check (confirms Next.js can reach MySQL):
[http://localhost:3000/api/health](http://localhost:3000/api/health) →
`{"ok":true,"database":"up"}`

### Quick verification

These are the commands I run before sharing the project:

```bash
npm install
npm run lint
npm run test
npm run build
```

---

## Environment variables

See `.env.example`. Only `DATABASE_URL` is required to run the app and
search demo data. Reddit ingest can run without credentials; other source
variables are optional experimental adapters and are not required for the
current demo.

| Variable             | Required              | Purpose                                                              |
| -------------------- | --------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`       | yes                   | `mysql://user:pass@host:3306/timescout`                              |
| `RETAILED_API_KEY`    | optional experiment   | Retailed dashboard API key for the Chrono24 adapter                  |
| `JOMASHOP_FEED_PATH`  | optional experiment   | Local path to a CJ-style product feed (tab or CSV)                   |
| `JOMASHOP_FEED_URL`   | optional experiment   | HTTPS URL to the same feed (Vercel / scheduled ingest)               |
| `JOMASHOP_CRON_ENABLE`| optional experiment   | Set `1` to pull Jomashop on `/api/cron/ingest` + `dev:scheduler`     |
| `JOMASHOP_CRON_HOUR_UTC` | optional experiment | Limit Jomashop to one UTC hour/day (0–23) to avoid huge frequent pulls |
| `CHRONO24_CRON_QUERIES` | optional experiment | Comma-separated Retailed search strings; defaults rotate by time slot |
| `CHRONO24_CRON_PAGES` | optional experiment   | Pages per Chrono24 cron run (default `1`)                            |
| `EBAY_APP_ID`         | optional legacy       | Legacy eBay Browse API scaffold                                     |
| `EBAY_CERT_ID`        | optional legacy       | Legacy eBay Browse API scaffold                                     |
| `REDDIT_USER_AGENT`   | optional              | Descriptive UA for Reddit calls; has a sensible default              |
| `CRON_SECRET`         | for scheduled cron    | Shared secret protecting `/api/cron/*`. Vercel Cron sends as Bearer. |
| `ADMIN_BASIC_USER`    | for admin auth        | HTTP Basic Auth username for `/admin/*` routes                       |
| `ADMIN_BASIC_PASS`    | for admin auth        | HTTP Basic Auth password for `/admin/*` routes                       |

### Data and secrets

- Real credentials belong only in `.env`; `.env` is ignored by Git.
- `.env.example` is safe to commit and documents the required variables.
- `ml/data/*.csv` files are generated from the local database and ignored.
- Runtime model artifacts in `models/*.json` are committed so the app can run
  local inference without requiring Python training during setup.

---

## npm scripts

| Script                    | What it does                                              |
| ------------------------- | --------------------------------------------------------- |
| `npm run dev`             | Next.js dev server on `:3000` (Turbopack)                 |
| `npm run build` / `start` | Production build + start                                  |
| `npm run lint`            | ESLint (Next core-web-vitals config)                      |
| `npm run db:push`         | Sync `db/schema.ts` → MySQL (create/alter tables)         |
| `npm run db:generate`     | Generate SQL migrations from schema diff                  |
| `npm run db:migrate`      | Apply generated migrations                                |
| `npm run db:studio`       | Drizzle Studio web UI for the DB                          |
| `npm run seed`            | Wipe + reseed with 20 demo listings                       |
| `npm run ingest:ebay`     | Legacy source-adapter scaffold                            |
| `npm run ingest:chrono24` | Experimental Chrono24 adapter via Retailed                |
| `npm run ingest:jomashop` | Experimental Jomashop/CJ-style feed adapter               |
| `npm run ingest:reddit`   | Fetch r/Watchexchange WTS posts into `listings`           |
| `npm run dev:scheduler`   | Run the production cron jobs locally (ingest + rescue)    |
| `npm run backfill:parse`  | Re-run the brand/reference parser and price extractor     |
| `npm run backfill:local`  | Run local TF-IDF + LR classifiers on unfilled rows        |
| `npm run backfill:ai`     | LLM-classify rows whose condition + watch_type are still null |

### Ingest examples

```bash
# Reddit r/Watchexchange WTS posts; default: 3 pages + OP-comment price rescue
npm run ingest:reddit
npm run ingest:reddit -- --pages 5           # go deeper
npm run ingest:reddit -- --no-comments       # skip slow price rescue (~30s)
```

Experimental source adapters are present but not required for the current
product demo:

```bash
# Chrono24 adapter prototype via Retailed
npm run ingest:chrono24 -- --query "Omega Speedmaster" --pages 2

# Jomashop/CJ-style feed adapter prototype
npm run ingest:jomashop -- --file ./data/jomashop-feed.txt

# Legacy eBay Browse API scaffold
npm run ingest:ebay -- --pages 3 --limit 50
npm run ingest:ebay -- --query "rolex submariner" --pages 2
```

All ingesters are safe to re-run — every call upserts on
`(source_id, external_id)` and bumps `last_seen_at` on repeat sightings.

### Backfill parser

```bash
npm run backfill:parse                     # re-parse everything
npm run backfill:parse -- --only-missing   # only rows with null brand/price
npm run backfill:parse -- --no-price       # brand/reference only

# AI classification (requires OPENAI_API_KEY)
npm run ingest:reddit -- --ai              # AI fallback during ingest
npm run backfill:ai                        # backfill existing nulls (default 100 rows)
npm run backfill:ai -- --limit 500 --min-confidence 0.7
npm run backfill:ai -- --dry-run           # call API but don't write
```

---

## Scheduling & freshness

The app relies on scheduled ingestion to stay useful. Two jobs are defined,
each exposed as a cron-authenticated API route:

| Route                          | When      | What it does                                                                |
| ------------------------------ | --------- | --------------------------------------------------------------------------- |
| `POST /api/cron/ingest`        | every 15m | Reddit r/Watchexchange ingest (fast path, no OP comments). Experimental Chrono24/Jomashop adapters only run when their env vars are explicitly configured. Legacy URL: `/api/cron/ingest-reddit` (same handler). |
| `POST /api/cron/rescue-prices` | every 60m | For recently ingested rows with no price, fetch OP comment and re-extract.  |

Both require `CRON_SECRET` (sent as `Authorization: Bearer <secret>` or
`?secret=<secret>`). Schedules are declared in `vercel.json` for Vercel Cron;
any external scheduler can hit the same endpoints.

Experimental Chrono24 rotation can be enabled with comma-separated
`CHRONO24_CRON_QUERIES`; `CHRONO24_CRON_PAGES` defaults to `1` per run to limit
Retailed usage. Experimental Jomashop ingest requires `JOMASHOP_CRON_ENABLE=1`
plus `JOMASHOP_FEED_URL` or `JOMASHOP_FEED_PATH`; use `JOMASHOP_CRON_HOUR_UTC`
(0–23) to fetch at most once per day during that UTC hour.

Freshness rules in search:

- By default, `searchListings`, `topBrands`, `listBrands`, and `totalListings`
  exclude listings whose `last_seen_at` is older than **3 days** (a listing
  that stops appearing in Reddit's `/new` for that long is treated as
  sold/pulled).
- The search UI has an **"Include stale listings"** toggle that flips to
  `includeStale=1` on the URL.
- `DEFAULT_STALE_AFTER_DAYS` in `lib/search.ts` is the single knob that
  controls this window (`DEFAULT_STALE_AFTER_HOURS` is derived for callers
  that pass `staleAfterHours`).

### Running the scheduler locally

Instead of Vercel Cron, you can run both jobs from your laptop:

```bash
npm run dev:scheduler   # runs forever; ingest every 15m, rescue every 60m
```

This does the same work the cron endpoints do, but directly in-process against
your local DB. Useful when you want fresh data flowing while iterating on UI.

---

## Project structure

```
app/
  page.tsx                  Landing page
  layout.tsx                Root layout
  globals.css               Tailwind entry
  search/page.tsx           Search UI (server-rendered, URL-driven)
  go/[id]/route.ts          Outbound click redirect + logger
  admin/clicks/page.tsx     Admin view for outbound click reporting
  admin/analytics/page.tsx  Full analytics dashboard (funnel, search, sessions)
  api/health/route.ts       MySQL ping
  api/analytics/route.ts    Client-side analytics event collector

db/
  index.ts                  Lazy Drizzle + mysql2 pool
  schema.ts                 Tables: sources, listings, clicks, analytics_events

lib/
  format.ts                 formatUsd(), timeAgo()
  search.ts                 searchListings(), listBrands()
  analytics.ts              Session cookie, IP hashing, bounded strings
  watches/parse.ts          parseWatch(title) → { brand, reference }
  ingest/
    reddit.ts               r/Watchexchange WTS → listings
    chrono24.ts             Experimental Chrono24 adapter
    jomashop.ts             Experimental CJ-style feed adapter
  chrono24/
    retailedSearch.ts       Retailed HTTP client for the Chrono24 adapter
  ebay/
    auth.ts                 Legacy OAuth client_credentials token cache
    browse.ts               Legacy Browse API wrapper + condition mapping

ml/                           Python training code (local dev only)
  requirements.txt            scikit-learn, pandas, mysql-connector-python
  preprocess.py               Shared tokenizer (MUST match lib/ml/features.ts)
  train_condition.py          Condition classifier trainer
  train_watch_type.py         Watch-type binary classifier trainer
  train_brand_disambiguator.py  Brand disambiguator trainer
  train_reference_scorer.py   Reference scorer trainer
  eval.py                     Holdout evaluation + confusion matrices
  data/export.py              Export labeled rows from MySQL → CSV

models/                       JSON model artifacts (~14 MB total, checked in)
  condition.json
  watch_type.json
  brand_disambiguator.json
  reference_scorer.json

lib/
  ml/                         Pure TS ML inference (zero Python at runtime)
    features.ts               Text normalization (mirrors preprocess.py)
    tfidf.ts                  TF-IDF vectorizer port
    logistic.ts               Logistic Regression inference
    loader.ts                 Lazy JSON model loader with caching
    index.ts                  classifyLocal() entry point
    classifiers/
      condition.ts            condition tier classifier
      watchType.ts            modern / vintage classifier
      brand.ts                Brand disambiguation via candidate scoring
      reference.ts            Reference extraction via candidate scoring

scripts/
  seed.ts                   Demo data seeder
  backfill-parse.ts         Re-parse all listings
  backfill-local.ts         Run local ML on unfilled rows
  ingest/
    ebay.ts                 Legacy eBay ingestion scaffold
    chrono24.ts             Experimental Chrono24 adapter CLI
    jomashop.ts             Experimental feed adapter CLI
    reddit.ts               Reddit CLI + rescue flags
```

---

## Database schema

Core tables. Raw source data is always preserved so we can re-parse later.

### `sources`
Where a listing came from (Reddit today; dealer/feed/API sources later).

| Column      | Notes                                  |
| ----------- | -------------------------------------- |
| `id`        | PK                                     |
| `slug`      | unique, e.g. `reddit-watchexchange`                         |
| `name`      | display name                           |
| `base_url`  | optional                               |
| `is_active` | soft disable                           |

### `listings`
Normalized listing row, prices stored in cents.

| Column          | Notes                                              |
| --------------- | -------------------------------------------------- |
| `source_id`     | FK → `sources`                                     |
| `external_id`   | stable id from source; dedupe with `source_id`     |
| `title`         | raw title                                          |
| `brand_raw`     | raw brand from source (may be null)                |
| `model_raw`     | raw model from source                              |
| `reference_raw` | raw reference from source                          |
| `brand`         | canonical brand after parsing (`Rolex`, etc.)      |
| `reference`     | canonical reference after parsing (`126610LN`)     |
| `price_cents`   | USD cents                                          |
| `currency`      | ISO 4217, currently always `USD`                   |
| `condition`     | `unworn` / `excellent` / `very good` / `good` / `fair` |
| `watch_type`    | `modern` / `vintage`                               |
| `classifier_source` | `regex` / `local` / `ai` — which system labeled it |
| `local_confidence`  | 0.00–1.00 from local TF-IDF + LR model           |
| `ai_confidence`     | 0.00–1.00 from OpenAI GPT-4o-mini                 |
| `listing_url`   | outbound URL to original source                    |
| `image_url`     | primary image                                      |
| `region`        | US state (2-letter) when known                     |
| `first_seen_at` | first ingestion timestamp                          |
| `last_seen_at`  | last time we saw it during ingestion               |

**Indexes**: unique `(source_id, external_id)`, and single-column on
`brand_raw`, `brand`, `reference`, `price_cents`, `last_seen_at`.

### `clicks`
One row per outbound click through `/go/[id]`.

| Column        | Notes                                                    |
| ------------- | -------------------------------------------------------- |
| `listing_id`  | FK → `listings` (cascade delete)                         |
| `source_id`   | FK → `sources`                                           |
| `ip_hash`     | SHA-256 of `ip + YYYY-MM-DD`; never the raw IP           |
| `user_agent`  | truncated                                                |
| `referer`     | truncated                                                |
| `placement`   | optional tag — `search`, `home`, later `email`, etc.     |
| `created_at`  | timestamp                                                |

### `analytics_events`
Privacy-aware product analytics. Tracks page views, searches, filter applications,
and outbound clicks tied to an anonymous 30-day session cookie (`ts_sid`).

| Column          | Notes                                                      |
| --------------- | ---------------------------------------------------------- |
| `event_type`    | `page_view`, `search`, `filter_apply`, or `click`          |
| `session_id`    | Random UUID from `ts_sid` cookie                           |
| `ip_hash`       | Daily-salted SHA-256 hash; never raw IP                    |
| `user_agent`    | Bounded to 512 chars                                       |
| `referer`       | Bounded to 512 chars                                       |
| `path`          | URL pathname, e.g. `/search`                               |
| `query`         | URL query string, bounded to 1024 chars                    |
| `placement`     | UI placement hint (`search`, `home`)                       |
| `listing_id`    | For click events — which listing was clicked               |
| `source_id`     | For click events — which source                            |
| `metadata_json` | Freeform JSON for event-specific data (filter selections, etc.) |
| `created_at`    | Timestamp                                                  |

**Indexes**: `event_type`, `session_id`, `created_at`, `listing_id`, `source_id`.

### `listing_label_reviews`
Human-reviewed labels and queue-clearing flags. This table lets reviewers mark
fields as corrected, unknown, benign multi-brand noise, local-confidence
reviewed, sold-reviewed, or bundle-reviewed without losing the raw listing row.

### `listing_gold_eval`
Human-approved offline evaluation set. Gold rows are held out of training
exports and used to compare parser/model changes before shipping them.

---

## Key features

### Search (`/search`)

Server-rendered, URL-driven — every filter is a query param, so search
results are shareable.

**Supported params:**

- `q` — free-text, matches `title`, `brand`, `reference`, `brand_raw`, `model_raw`, `reference_raw`
- `brand` — exact match on parsed canonical brand
- `condition` — `unworn` / `excellent` / `very good` / `good` / `fair` / `n/a`
- `watchType` — currently exposes `vintage` as a filter; modern listings are
  the default when no vintage filter is applied
- `minPrice`, `maxPrice` — USD
- `state` — 2-letter US state code
- `sort` — `relevance` (default: most recently seen), `newest`, `price_asc`, `price_desc`

Examples:

- `/search?brand=Rolex`
- `/search?q=speedmaster&minPrice=3000`
- `/search?state=CA&sort=price_desc`

### Outbound click redirect (`/go/[id]`)

When a user clicks "View" in search results, they go through
`/go/<listing_id>?p=search`. The handler:

1. Looks up the listing.
2. Validates the target URL is `http(s)`.
3. Fire-and-forget inserts a row in `clicks` (DB failures never block the redirect).
4. 302s to `listing_url`.

This is the hook point to rewrite URLs with affiliate tags later if/when
affiliate sources are added — nothing to change in the UI.

### Admin analytics (`/admin/analytics`)

Full product analytics dashboard built on the `analytics_events` table:

- **Funnel KPIs** — page views → searches → filter applies → outbound clicks (7d & 24h).
- **Search usefulness** — top queries, zero-result sessions, search click-through rate.
- **Filter usage** — breakdown of which sidebar filters are applied most.
- **Source performance** — clicks by source and placement.
- **Session summary** — recent anonymous sessions with event/search/click counts.

### Outbound click reporting (`/admin/clicks`)

Legacy click-only dashboard with daily trends, top listings, and recent clicks.

> **Auth:** `/admin/*` routes are protected by HTTP Basic Auth using
> `ADMIN_BASIC_USER` and `ADMIN_BASIC_PASS` env vars. In development mode,
> access is allowed if they are unset. A per-IP rate limiter blocks brute
> force attempts (8 failures → 30-minute lockout).

### Local ML classification pipeline

Four TF-IDF + Logistic Regression models augment the regex parsers:

| Model | File | Purpose | Holdout F1 |
|-------|------|---------|-----------|
| Condition | `models/condition.json` | condition tier classifier | 0.55 macro |
| Watch type | `models/watch_type.json` | vintage vs modern | 0.89 macro |
| Brand disambiguator | `models/brand_disambiguator.json` | scores regex brand candidates | 0.46 macro |
| Reference scorer | `models/reference_scorer.json` | scores reference candidates | 0.65 macro |

**Cascade order:** regex (free, instant) → local ML (free, <5ms) → OpenAI (opt-in, ~$0.0002/call).

Training scripts live in `ml/`. To retrain after new data:

```bash
cd ml
python3 data/export.py          # export latest labels from MySQL
python3 train_condition.py      # → models/condition.json
python3 train_watch_type.py     # → models/watch_type.json
python3 train_brand_disambiguator.py  # → models/brand_disambiguator.json
python3 train_reference_scorer.py     # → models/reference_scorer.json
python3 eval.py                 # → ml/eval_report.txt
```

To backfill existing listings with local predictions:

```bash
npm run backfill:local                      # process 500 rows
npm run backfill:local -- --limit 2000      # bigger batch
npm run backfill:local -- --force           # reclassify even previously done rows
```

During ingest, local ML runs by default. Disable with `--no-local`:

```bash
npm run ingest:reddit                   # regex + local ML
npm run ingest:reddit -- --no-local     # regex only
npm run ingest:reddit -- --ai           # regex + local ML + OpenAI fallback
```

The `/admin/ai` page shows per-source coverage breakdown, confidence
distributions, and low-confidence rows for manual review.

### Admin review workflow

The `/admin/review` page is where parser/model uncertainty becomes labeled data.
Rows are grouped by missing fields, low local confidence, possible bundles, sold
signals, multi-brand mentions, and saved review/gold-eval cases. Review actions
write to `listing_label_reviews`; gold-eval actions write to `listing_gold_eval`
and are kept out of training exports by design.

### Brand + reference parser (`lib/watches/parse.ts`)

Best-effort `parseWatch(title)` returning `{ brand, reference }`.

- ~35 brand dictionary with aliases (`patek` → `Patek Philippe`, `jlc` → `Jaeger-LeCoultre`)
- Longest-match wins (`Grand Seiko` beats `Seiko`)
- Per-brand reference regex (e.g. Omega `310.30.42.50.01.001`, IWC `IW327011`, Panerai `PAM01312`)
- Filters out noise tokens: years, `40mm`, `new`, colors, metals
- Returns `null` rather than guessing when unsure

The parser runs:

- During `seed` and any ingest run (on insert/update)
- Via `backfill:parse` against existing rows

---

## Adding a new source

1. **Decide how data comes in** — official API, partner feed, RSS, CSV. Avoid
   aggressive scraping; pick sources where ingestion is sanctioned.
2. **Create a typed client** in `lib/<source>/`.
3. **Write `scripts/ingest/<source>.ts`** that:
   - Ensures a `sources` row exists (upsert on `slug`).
   - Fetches listings and upserts into `listings` on
     `(source_id, external_id)`, with `last_seen_at = CURRENT_TIMESTAMP`.
   - Calls `parseWatch(title)` to fill `brand` and `reference`.
4. **Add an `npm run ingest:<source>` script** in `package.json`.
5. **Sanity check** on `/search` — pick the new source in the UI filter.

Use `scripts/ingest/reddit.ts` as the primary template. The Chrono24,
Jomashop, and eBay files are source-adapter prototypes retained for future
multi-source work.

---

## Roadmap

Done:

- [x] MySQL schema + Drizzle ORM
- [x] Demo seed + URL-driven search page
- [x] Brand + reference parser
- [x] Source-adapter prototypes for eBay, Chrono24, and Jomashop
- [x] Outbound click redirect + admin analytics
- [x] Reddit ingest + OP-comment price rescue
- [x] Cron endpoints and local scheduler
- [x] Stale/sold listing hiding
- [x] Admin auth gate
- [x] Admin review queues + data health
- [x] Local ML training/export/inference loop
- [x] Gold evaluation set workflow

Next, in priority order:

- [ ] Stabilize a second active source — dealer with public JSON feed or RSS
- [ ] Pagination on `/search` beyond 50 rows
- [ ] Full-text search via MySQL `FULLTEXT` or Meilisearch/Typesense
- [ ] Saved searches + email alerts
- [ ] Affiliate URL rewriting in `/go/[id]` (e.g. eBay EPN rover links)

---

## Troubleshooting

**`db:push` complains `url: ''`**
Make sure `.env` exists (not just `.env.example`) and has
`DATABASE_URL=mysql://...`. The CLI loads it via `dotenv/config` from
`drizzle.config.ts`.

**Search page crashes with "Unknown column 'brand'"**
You edited the schema but did not run `npm run db:push`. Push, then
`npm run seed` to populate the parsed columns.

**Admin review fails with unknown columns (`brand_reviewed`, `multi_brand_reviewed`, …)**  
Run `npm run db:push` so MySQL matches `db/schema.ts`. For migration-style deploys you can apply `drizzle/0001_add_multi_brand_reviewed.sql` when adding `multi_brand_reviewed`.

**`npm audit` shows esbuild moderate vulnerability**
Transitive dep of `drizzle-kit`. Only relevant if esbuild's own dev server
is running (it isn't, in any of our scripts). Safe to ignore; do **not**
run `npm audit fix --force` — it will downgrade `drizzle-kit` drastically.

**Experimental source adapter fails auth**
The Chrono24/Retailed and eBay adapters require third-party credentials. They
are not needed for the current Reddit-focused demo.

---

## License

MIT. See [LICENSE](./LICENSE).
