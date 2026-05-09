# Gold evaluation set

## Purpose

TimeScout’s production metrics mix human review, regex, legacy rows, and model outputs. That noise makes it hard to trust aggregate accuracy. The **gold eval set** is a small, **human-approved** slice of listings whose labels are treated as ground truth for **offline evaluation only**.

Use it to score models on condition, watch type, brand, reference, price (including ranges), bundle vs single, and sold — before shipping classifier changes.

## Rules

- **Manually approved**: Every row in `listing_gold_eval` should be filled by a curator after inspecting source text (title, description, listing URL).
- **Not for training**: These listings are **excluded** from `ml/data/export.py` training CSVs via a hold-out join on `listing_gold_eval`. Do not merge gold-eval rows into training exports.

## Target size

- **Phase 1**: ~**150** listings.
- **Phase 2**: grow toward **~300** as coverage needs increase.

## Suggested mix

Align candidate sampling with the seed script buckets (balanced across):

- Missing brand, missing price, missing condition  
- Low local classifier confidence  
- Possible bundle, sold detected  
- Multi-brand mention noise  
- “Clean” normal listings (sanity baseline)

The script `npm run seed:gold-eval-candidates` proposes IDs; humans still choose what to add and how to label.

## Database

- Table: **`listing_gold_eval`** (see `db/schema.ts`).
- **Local / dev schema sync**: after pulling changes, apply the schema with Drizzle:

  ```bash
  npm run db:push
  ```

  Alternatively, apply the SQL in `drizzle/0002_listing_gold_eval.sql` manually if your workflow prefers migration files. **Do not** assume production schema updates run automatically from this repo.

## Workflow

1. Generate candidates (recent-window, balanced buckets):

   ```bash
   npm run seed:gold-eval-candidates -- --limit 150
   ```

   Output: `ml/data/gold_eval_candidates.csv` plus a terminal summary. If a bucket
   has fewer rows than its share (common for “missing price”), the script tops up
   with recent listings tagged `recent listing (quota fill)` so `--limit` is met.

2. Curators pick listings from that CSV (or the DB), research each listing, and **INSERT/UPDATE** rows in `listing_gold_eval` with agreed gold labels (`notes` for edge cases).

3. Export the gold set for eval scripts / notebooks:

   ```bash
   npm run export:gold-eval
   ```

   Output: **`ml/data/gold_eval.csv`** (listing text + gold columns).

Training pipelines should continue to use `ml/data/export.py` unchanged aside from the built-in gold-eval hold-out.
