# TimeScout — Product & design direction

This doc is the "what we are and what we are not" reference for TimeScout.
When a UI, copy, or feature decision is ambiguous, check it against the
principles below.

---

## In one sentence

**TimeScout is a search utility for watch listings across the US web — one
box, many marketplaces, always links out to the original source.**

We are a router and an index, not a store, not a marketplace, not a
curator. The listings are not ours; the search experience is.

---

## What it is — and is not

**It is:**

- A **tool**. Fast, useful, forgettable once the user has what they need.
- A **neutral aggregator**. We don't favor sources; the best deal wins.
- An **outbound experience**. Our best moment is when a user leaves to buy.

**It is not:**

- A watch magazine, a community, or a collector's hangout.
- A seller. We never take payment, never hold inventory, never authenticate.
- A luxury boutique. No velvet, no silk, no black-and-gold "exclusivity."

If it feels like a boutique, we went too far. If it feels like a coupon
site, we didn't go far enough.

---

## Target user

Primary: **US buyers researching a watch before they buy.**

They usually already know roughly what they want — a Seamaster, a BB58, a
Royal Oak — and they are shopping for the **best combination of price,
condition, and seller** across several marketplaces they'd otherwise have
to check one by one.

They are:

- Comfortable with the web, not with jargon.
- Price-aware but not cheap; they'll spend real money for the right piece.
- Skeptical — they've been burned by bad photos and optimistic condition
  grading before.

We are *not* building for:

- First-time gift buyers who want a concierge.
- Hardcore collectors who already have dealers on speed dial.
- People who want forums, wrist shots, or community features.

---

## Positioning reference points

| Brand       | Why we reference it                                                |
| ----------- | ------------------------------------------------------------------ |
| **Jomashop**    | **Visual reference only, not a current data source.** Clean retail, product-forward, prices loud, no preciousness. Approachable, not corporate. |
| Kayak / Google Flights | The search-utility mental model — a big input field, clean results, fast filtering, trust through competence. |
| DuckDuckGo  | A tool. Loads fast, does its job, respects the user's time and data. |
| AutoTempest | The **functional inspiration** we're inheriting — but its visual execution is something we explicitly move away from. |

### What we **won't** look like

- **Chrono24** / **Hodinkee Shop**: too curated, too precious, too much
  editorial gravity. We are not trying to sell the romance of watches.
- **Crown & Caliber / WatchBox hero pages**: huge moody photos, Helvetica
  on black, "the journey of time." Not our vibe.
- **AutoTempest**: cluttered, dated, busy with ads. Technically useful,
  visually forgettable.
- **StockX / GOAT**: commodity-trading aesthetic. Too sneaker-floor.

---

## Brand personality

If TimeScout were a person they would be:

- A **knowledgeable friend** who already knows the market and points you
  at good listings without telling you what to think about them.
- Not a concierge, not a hype man, not a purist.
- Honest about uncertainty: "we saw this 6 hours ago," "price changed,"
  "listing gone."

Three adjectives to hold us to: **Useful. Honest. Calm.**

Three words we avoid: *curated, exclusive, discover.*

---

## Tone of voice

Plain, direct, American English. Sentence case, not Title Case. Short
sentences. Say what the thing is.

| Do                                              | Don't                                                   |
| ----------------------------------------------- | ------------------------------------------------------- |
| "14,250 listings"                                | "Discover over 14,000 timepieces"                       |
| "Seen 2h ago on Reddit"                          | "Handpicked from a trusted seller partner"              |
| "We link out to the source. We don't verify listings." | "Authenticity guaranteed by our network of experts"     |
| "View source"                                    | "Secure this piece now"                                 |
| "No results. Try widening the price range."      | "Alas, no treasures found. Refine your search."         |

We can be a little dry. A *little*. We are not funny for the sake of it.

---

## Visual direction

Think **clean retail utility built in 2026** — not a luxury boutique, not a
coupon site. Jomashop is only a visual reference point, not a claim that it is
currently powering the index.

### Layout

- **Generous negative space** around a dense-enough content grid.
- **Left-to-right reading order**: logo → search → filters → results.
- **Cards over lists** for listings. 2–3 columns on desktop, 1 on mobile.
- **Prices are the loudest thing in a card.** Bigger, darker than the title.
- **Images are rectangular, photo-on-white**, not round and not cropped
  into moody squares.
- **No dense top bars with 8 nav items.** The top bar has: wordmark,
  search, saved (later), account (later).

### Type

- **Sans-serif**, functional. Inter, Söhne, or the system stack. No serifs,
  no display faces, no all-caps section headers.
- **Two sizes of heading, one body, one small.** Resist adding more.
- Numbers (prices, references) ideally in the same family but a little
  tighter — tabular figures if available.

### Color

- **Neutral background**, warm gray or paper-white rather than pure white.
  Current dev build uses a stone palette — that's fine.
- **One accent color**, used sparingly for primary actions and links.
  Consider a cool blue or a deep teal — not gold, not red.
- **Condition and freshness** use muted status colors (green for fresh,
  amber for stale) — never as bright as the primary action.
- **Dark mode supported**, not "luxury black." Think "night editor," not
  "VIP lounge."

### Imagery

- **Straight product photos** from the source, on white. When we get junk
  images (bad lighting, watermarks) we show them anyway and trust the user
  to judge — we are not a curator.
- **No lifestyle photos, no wrist shots, no moody atmospherics** on our
  own pages. Those belong to the sellers and their own listings.
- **Logos of sources** appear small next to the price, as a factual tag —
  not as endorsements.

### Motion

- **Almost none.** Page transitions are instant. Filters update without
  ceremony. We're a tool; tools don't animate their toolbars.
- Loading states use a muted skeleton row, not a spinner.

---

## UX principles

### 1. One box is the front door

The landing page and every page show a single, obvious search field. A
user who types a brand and presses Enter must get useful results.

### 2. Every filter is a URL

Search state lives entirely in query parameters. Sharing a search link
works. Back/forward in the browser does the right thing. No "lost my
filters" moments.

### 3. The best result wins; we don't pick favorites

- Default sort = **most recently seen**. (It reflects what's actually
  available right now.)
- Price sorts are first-class.
- We never promote "featured" listings. When we add affiliate links we
  disclose clearly; they do not change ranking.

### 4. Outbound is a feature, not a leak

- The **View** button opens the source in a new tab. The user's TimeScout
  tab stays exactly where it was.
- We track the click (aggregated, non-PII) only so we know what's
  resonating — not to build a profile.
- We are proud when users leave. That means we did our job.

### 5. Say what you don't know

- Price: "$12,400" is a fact. "Last seen 2h ago" acknowledges time drift.
- Parser guesses: if we couldn't parse the brand, show the title; don't
  invent one.
- No ratings, no "best deal" badges until we have real confidence.

### 6. Mobile is a first-class layout, not a reskin

- Single column.
- Sticky, slim filter bar at the top.
- Big, thumbable "View" button.
- Never an app install prompt.

---

## Core flows

### Discovery

1. Land on `/`, see a headline ("Search watch listings across the US") and
   a single search field.
2. Type: `submariner`. Hit Enter.
3. `/search?q=submariner` loads a grid of listings across sources with
   filters on the left or top.

### Refine

1. Flip brand to "Rolex", set `minPrice=8000`, `maxPrice=15000`.
2. URL reflects the state. Page re-renders server-side.
3. Switch sort to price asc.

### Leave

1. Click "View". New tab, marketplace opens. Our tab stays put.
2. User closes the marketplace tab and can keep comparing.

### Come back

1. We reload the same URL days later; listings freshness and sort keep it
   current.
2. (Later) Save search → email alert when new listings match.

---

## Information architecture

### Listing card — what appears on each

| Slot               | Source                                                       |
| ------------------ | ------------------------------------------------------------ |
| Source tag         | `sources.name` ("Reddit")                                    |
| Title              | `listings.title`                                             |
| Sub-line           | `brand · reference` (falls back to raw fields)               |
| Condition pill     | `unworn` / `excellent` / `very good` / `good` / `fair`       |
| Price              | `price_cents` formatted as `$12,400`                         |
| Freshness          | `US state · seen 2h ago`                                     |
| Action             | **View** → `/go/[id]?p=search`                               |

We don't show: seller ratings, shipping, description blurbs. Those belong
on the source page. We show enough to decide whether it's worth clicking.

### Filters (in order of importance)

1. Free text
2. Brand (parsed, canonical list)
3. Price range
4. Condition
5. US state
6. Sort

Anything beyond these is second-tier and lives in a "More filters" drawer.

### Navigation

Top bar, three zones:

- **Left:** wordmark.
- **Center:** persistent search input.
- **Right:** (later) saved searches, account.

No footer CTA sprawl. A slim footer with `About`, `FAQ`, `Contact`, and
a clear disclosure: "TimeScout shows listings from other marketplaces. We
don't sell, ship, or authenticate watches."

---

## Content guidelines

### Naming things

- **Listings**, not "timepieces" or "pieces."
- **Sources**, not "partners" or "retailers."
- **Brand** and **reference**, not "maker" or "model number."
- **US state**, not "region" or "territory" (even though the DB column
  is `region` — we'll rename on the UI side).

### Numbers

- Prices: `$12,400` (no cents, no decimals, USD implied).
- Counts: `1,248 listings` with commas.
- Time: `2h ago`, `3d ago`, `seen today` — never exact timestamps unless
  the user asks.

### Error states

- "No listings match these filters. Try widening the price range or
  clearing the brand filter."
- "That listing is no longer available. [See similar Rolex Submariner
  listings ↗]"
- Never a cute 404. We're a tool; tell the user what's wrong and where to
  go next.

---

## Disclosures & trust

- A persistent line in the footer: *"TimeScout links to listings on other
  marketplaces. We don't hold inventory or verify sellers."*
- When we add affiliate links, a short "How we make money" page explains
  it. One paragraph, one illustration, done.
- A small "Report this listing" link on every card (later) — counterfeits,
  dead listings, scams.
- Never present ourselves as an authenticator or expert.

---

## What we will never do (self-imposed rails)

- Fake scarcity messaging ("Only 2 left!" "Hot item!").
- Countdown timers on listings.
- "Recommended for you" carousels on the home page. We're search, not TikTok.
- Auto-opening modals, newsletter dickey pops, or "wait! don't go!" exit
  intent.
- Gold gradients, serifs on product cards, or any language borrowed from
  fine jewelry advertising.

---

## When this doc conflicts with a decision

1. First check: does the decision make the tool *more useful*?
2. Second check: does it make us more honest?
3. Third check: does it make the page calmer?

If two of those are yes, ship it — even if this doc didn't anticipate it.
Then update this doc.
