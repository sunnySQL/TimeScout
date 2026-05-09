# TimeScout — Project plan

A phased plan for taking TimeScout from "local prototype" to "useful public
site." Written for a solo developer; the phases are sized so each one can
ship independently and leave the product in a better state than before.

Pair this with:

- `README.md` — how the codebase works day-to-day
- `docs/architecture.md` — why the codebase works the way it does
- `docs/product.md` — what the product is trying to feel like

---

## North star

> A US shopper lands on TimeScout, types a brand or a reference, sees
> fresh listings from several marketplaces, clicks through to the best
> one, and buys. We get a small commission on the click, never charge the
> user, and never pretend to be a seller or authenticator.

Two success signals we can measure today:

1. **Clicks out / session.** Are people finding something worth clicking?
2. **Return visits.** Do people come back instead of going straight to
   Reddit search or individual marketplace pages?

Revenue comes later, after affiliate programs are wired.

---

## Where we are now (Phase 0: Foundation — done)

Shipped in the local prototype:

- Next.js 15 app on `:3000`
- MySQL 8 + Drizzle ORM with `sources`, `listings`, `clicks`
- Demo seed (20 realistic listings) and seed script
- URL-driven search page with brand/price/state/condition/sort filters
- Brand + reference parser (~35 brands, per-brand reference regex, noise
  filtering)
- Reddit r/Watchexchange ingest as the active source
- Optional source-adapter prototypes for eBay, Chrono24 (Retailed), and
  Jomashop/feed-style catalogs
- Outbound click redirect with IP hashing and placement tagging
- Admin page showing 7-day click stats
- Admin review queues, data health, local ML pipeline, and gold eval workflow
- README, architecture, and product docs

What's **not** done yet: a second active production source, hosting polish,
email, affiliate.

---

## Phase 1 — First real data

**Objective:** Replace demo listings with **live catalog rows** from
sanctioned sources so the whole pipeline is exercised end-to-end.

**Source status (current codebase):**

- **Reddit** — `npm run ingest:reddit` (r/Watchexchange WTS); already the
  active source and default “always on” path in cron.
- **Chrono24 / Jomashop / eBay** — adapter prototypes. Keep them as proof that
  the ingestion interface can support more sources, but do not present them as
  current product coverage until one is stabilized and used regularly.

**Deliverables:**

- `.env` populated for Reddit/local DB in development.
- Manual ingest runs + spot-check `/search` (brands parsed, prices sane,
  images present).
- A **parser tuning round**: `npm run backfill:parse`, extend
  `lib/watches/parse.ts` for titles that still come back `null`.

**Exit criteria:**

- `/search` returns a meaningful volume of recent Reddit listings.
- >80% of rows have a parsed `brand` where the source title carries a signal.
- >60% of rows have a parsed `reference` where applicable.
- No errors in the ingest log across three consecutive runs.

**Risks / mitigations:**

- *Title noise breaking the parser* → fix aliases, re-backfill, iterate.

---

## Phase 2 — Freshness & scheduling

**Objective:** Make the index stay useful without manual intervention.

**Deliverables:**

- A scheduled runner: `launchd` on macOS for local dev, cron/systemd
  timer once deployed.
- Ingest runs every **1–2 hours** for a rotating set of popular queries;
  one daily pass over the full category.
- **Stale hiding:** default `/search` excludes rows where
  `last_seen_at < NOW() - INTERVAL 48 HOUR`. Admin can include them via
  `?includeStale=1`.
- Structured logging to a file, with error counts per run.
- Basic retry/logging for transient source failures.

**Exit criteria:**

- Zero-touch operation for a week: index stays fresh, errors stay <1%.
- Stale listings drop off `/search` within 48 hours.

**Risks / mitigations:**

- *Missed runs from a laptop asleep* → switch to a hosted worker (see
  Phase 5) as soon as you deploy.
- *"Last seen 46h ago" feels stale in the UI* → freshness chip in the
  card ("seen 2h ago" / "1d ago") gives users the right mental model.

---

## Phase 3 — Visual polish

**Objective:** Bring the UI to the bar described in `docs/product.md`.

**Deliverables:**

- Typography: single sans-serif family with tabular figures for numbers.
- Color system in `globals.css` as CSS variables: background, surface,
  muted, accent, status (fresh/stale). One accent, used only on primary
  actions.
- Listing card redesign:
  - Prominent price, quieter title.
  - Small source tag + condition pill.
  - Freshness chip (`seen 2h ago`).
  - Image on white.
- Header: wordmark (left), persistent search (center), placeholder nav
  (right).
- Footer: disclosure line, `About`, `FAQ`, `Contact`.
- Mobile pass: single-column cards, sticky slim filter bar, thumb-friendly
  View button.
- Basic 404 and empty states rewritten in the plain-spoken voice from the
  product doc.

**Exit criteria:**

- Side-by-side with clean modern retail tools, the vibe is "same neighborhood,"
  not "luxury boutique," not "AutoTempest."
- All pages look right at 360px, 768px, 1440px.

**Risks / mitigations:**

- *Scope creep into "brand identity"* → logo and wordmark can be
  workmanlike for now; we're not in a market where logo is the hook.

---

## Phase 4 — Second source

**Objective:** Prove the multi-source thesis. With only Reddit, we're a strong
single-source marketplace intelligence tool; a second active source makes it a
true aggregator.

**Deliverables:**

- Pick one source that is **ToS-friendly and low-effort** — in priority:
  1. A public dealer with a JSON feed, RSS, or easy sitemap.
  2. A partner dealer who will send us CSV or webhook.
  3. A smaller marketplace with a public API.
- New ingestion script in `scripts/ingest/<source>.ts`, same upsert shape.
- Source filter in `/search` so users can narrow to one marketplace.
- Brand-and-reference parser hit rate spot-check against the new data.

**Exit criteria:**

- `sources` table has two active rows.
- At least 200 listings from the second source show up in search.
- `/search?source=<slug>` works.

**Risks / mitigations:**

- *Scraping temptation* → don't. Scraping is a perpetual maintenance tax
  and a ToS liability. Wait for a clean option.

---

## Phase 5 — Public beta

**Objective:** Put it online at a real domain so real users can use it.

**Deliverables:**

- **Domain:** `timescout.*` registered.
- **Hosting:** Vercel (Next.js) + a managed MySQL (PlanetScale, RDS, or
  DigitalOcean managed). One-command deploy on push to `main`.
- **Environment separation:** `.env.production` with prod `DATABASE_URL`;
  source-specific secrets are injected via host, not committed.
- **Ingestion worker:** runs on the server, not on your laptop. Either a
  Vercel Cron job (for small volumes) or a tiny DigitalOcean droplet with
  `systemd` timers.
- **Admin auth:** basic auth or a single-sign-on via GitHub/email on
  `/admin/*`.
- **Disclosures live:** footer disclosure, `/about`, `/how-we-make-money`
  (placeholder while no affiliate is active yet).
- **Minimal SEO:** `robots.txt`, sitemap of popular search URLs, OG tags
  on the homepage.
- **Error + uptime monitoring:** Sentry on the app, an uptime ping on
  `/api/health`.

**Exit criteria:**

- You can share a real URL with friends.
- One week of zero-intervention uptime.
- A friend can search, filter, click through, and land on a live listing
  without anything looking broken.

**Risks / mitigations:**

- *DB costs* → MySQL is fine, pick a cheap managed tier; tables are small.
- *Surprise traffic* → unlikely at launch. Cache popular search pages at
  the edge if needed.

---

## Phase 6 — Saved searches + email alerts

**Objective:** Give users a reason to come back without requiring heavy
accounts.

**Deliverables:**

- Lightweight email-only "accounts": enter an email, confirm, save a
  search. No passwords.
- Nightly job: for each saved search, find listings where
  `first_seen_at > last_email_sent` and send a digest.
- Unsubscribe one-click.
- `saved_searches` and `users` tables in MySQL.
- Transactional email provider (Resend or Postmark).

**Exit criteria:**

- Create an account, save a search, receive an email the next day when a
  matching listing appears, click through to the site.

**Risks / mitigations:**

- *Spam filters* → SPF/DKIM/DMARC set up correctly; send from a real
  domain.
- *PII escalation* → keep schema minimal. Email + password-less tokens
  only, no names, no addresses.

---

## Phase 7 — Better search

**Objective:** When `LIKE %q%` starts feeling slow or dumb, upgrade.

**Triggers (any one):**

- Listings table >100k rows.
- Noticeable latency on `/search` (>300ms).
- Users with typos or multi-word queries getting bad results.

**Options in order of preference:**

1. **MySQL `FULLTEXT` index** on `title`, `brand`, `reference`. Zero new
   infra.
2. **Meilisearch or Typesense**, self-hosted on the same box. Real fuzzy
   search, instant-search feel.
3. Elasticsearch — only if the above hit a wall, which they won't at this
   scale.

**Deliverables:**

- New search backend behind the existing `searchListings()` signature so
  the API layer doesn't change.
- Re-indexing job triggered after ingestion.

**Exit criteria:**

- `/search` returns in <200ms p95 at 200k listings.
- Common typos (`submariner` → `submarnier`) still return useful results.

---

## Phase 8 — Affiliate program

**Objective:** Start earning on outbound clicks without compromising the
neutral-aggregator positioning.

**Deliverables:**

- Join a source-appropriate affiliate program after a second source is stable.
- Rewrite outbound URLs in `/go/[id]` only for sources with approved affiliate
  terms.
- Keep similar rewrite hooks source-specific and opt-in.
- "How we make money" page goes from placeholder to real content.
- Sort/ranking stays untouched. **We never re-order based on affiliate
  rate.**
- Admin page adds an "affiliate" column: which outbound clicks went
  through an affiliate rewrite vs. raw.

**Exit criteria:**

- Affiliate dashboard shows first tracked clicks.
- Disclosure line visible on every page / in the FAQ.
- A/B on ranking confirms affiliate-eligible listings are not artificially
  advantaged.

**Risks / mitigations:**

- *Temptation to juice ranking for revenue* → the rule is written down
  (`docs/product.md`) and `/admin/clicks` is the honesty check.

---

## Phase 9 — Source breadth

**Objective:** Become the thing people actually reach for first, not
second.

**Deliverables:**

- Add 2–3 more sources: partner dealers, one or two auction houses with
  public feeds, possibly `Crown & Caliber` / `Bob's Watches` if they'll
  partner.
- Expand category coverage (pocket watches? smartwatches? — probably no).
- Add a **reference landing pages** experiment: `/ref/126610LN` aggregates
  listings for that exact reference across sources. This is a big SEO
  lever.

**Exit criteria:**

- `sources` table has ≥5 active rows.
- Reference pages rank on Google for at least a handful of references
  (e.g. "rolex 126610ln for sale").

---

## Phase 10 — International (later)

**Objective:** Extend beyond US once US is clearly working.

This is deliberately late. Don't start until Phase 8 is stable.

**Work implied:**

- Multi-currency in `listings` (already partially supported by `currency`
  column and cents-based pricing).
- Region column expanded to country + subdivision.
- Per-market routing (`/us/...`, `/uk/...`) or IP-based default with
  manual override.
- Localized date/time and currency formatting.

---

## Cross-cutting concerns

These don't belong to a single phase but need to be watched throughout.

| Concern          | Ongoing practice                                              |
| ---------------- | ------------------------------------------------------------- |
| Legal / ToS      | Every new source: read the ToS, save a copy, note in its file |
| Security         | No raw IPs, admin auth by Phase 5, dependabot / `npm audit`   |
| Data quality     | Every phase: sanity SQL in Workbench ("top 10 unparsed titles") |
| Performance      | Budget: `/search` <300ms p95 on a modest managed MySQL        |
| Writing          | README, architecture, product, plan — updated in the same PR as the code |
| Backups          | Once hosted, nightly MySQL dump to off-host storage           |

---

## Rough timeline (solo, evenings/weekends)

These are **order-of-magnitude** estimates. Real timelines always slip;
use them to decide what to cut, not to plan calendars.

| Phase                        | Estimate        |
| ---------------------------- | --------------- |
| 1. First real data           | done for Reddit; ongoing parser/data quality work |
| 2. Freshness + scheduling    | 1 weekend       |
| 3. Visual polish             | 2 weekends      |
| 4. Second source             | 1–2 weekends    |
| 5. Public beta               | 2 weekends      |
| 6. Saved searches + email    | 2–3 weekends    |
| 7. Better search             | 1 weekend (FULLTEXT) or 2 (Meili) |
| 8. Affiliate program         | 1 weekend after a partner/source is selected + application wait |
| 9. Source breadth            | ongoing         |
| 10. International            | later           |

**First public beta (Phase 5) is realistically a focused polish/deployment push
away**, with source breadth and affiliate work deliberately later.

---

## Open decisions

Things we'll need to pick, but don't have to pick today. Listed here so
they don't get forgotten.

- **Domain name** — is `timescout.com` or some variant available and
  affordable? Alternates: `.watch`, `.app`, `.io`.
- **Hosting combo** — Vercel + PlanetScale is frictionless; DO droplet +
  managed MySQL is cheaper long-term.
- **Logo / wordmark** — workmanlike is fine for beta; revisit after Phase 5.
- **Newsletter vs. alerts-only** — editorial content is tempting but
  off-brand. Start alerts-only.
- **Listing page (`/listings/[id]`)** — do we need one, or is "the card
  links straight out" the whole product? Current stance: no listing page.
  Revisit if we get analytics saying users want to preview.
- **Reference landing pages** for SEO — powerful, but only worth building
  after parser accuracy crosses ~90%.

---

## Non-goals

Explicit list of things we are *not* building, to avoid scope creep.

- User-generated content (comments, reviews, forums).
- Authentication beyond email + token for saved searches.
- Watch wikis / model databases.
- Wrist-shot uploads, collection management, "watch box" features.
- Chat, community, Discord integration.
- Anything that requires us to hold inventory, ship, or process payments.

---

## Kill criteria

A gut check before each phase: *if the signal below never appears, we
should stop and rethink, not push harder.*

- After Phase 1: does search actually feel useful with real data? If
  listings still look like junk after parser tuning, the product is wrong,
  not the code.
- After Phase 5: do friends come back on their own within a week of
  seeing the site? If nobody does, we don't have product-market fit yet —
  more sources won't fix that.
- After Phase 8: do affiliate clicks actually convert? If EPN revenue is
  a rounding error even at modest traffic, the monetization model needs
  rethinking before scaling it.

---

## Known issues / backlog

Small, concrete improvements noted during build-out. Not phase-sized; pick
off opportunistically between phases.

- **Broader sold-post refresh.** Ingest + rescue detect SOLD on anything
  within the 72h rescue window. Posts that sold *after* aging off /new
  won't be caught without a dedicated "stale-check" pass that re-fetches
  already-priced rows to see if they've since been marked sold. Add if
  the sold leakage ends up being visible in practice.
- **Approximate-price UX polish.** Flair-derived prices now render as a
  range (`$750–$999 approx.`). If the `approx.` label proves too subtle,
  consider a dedicated `price_is_approximate` chip or a different visual
  treatment for bucket vs. exact prices.

---

## How to use this plan

- **Don't follow it rigidly.** Phases 2, 3, and 4 can happen in almost
  any order. Pick what feels highest leverage at the time.
- **Update it.** When a phase ships, move it to "Done" at the top and
  adjust downstream phases based on what you learned.
- **Let `docs/product.md` be the tiebreaker** when two technical options
  have similar effort but different product feel. The plan is
  replaceable; the product stance is less so.
