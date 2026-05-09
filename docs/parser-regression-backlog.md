# Parser / classifier regression backlog

Lightweight notes for weird real listings worth covering with tests later. Not a spec — capture intent only.

## Cases

### Steinhart Ocean 39 vintage GMT

- **Brand:** Steinhart (not ambiguous).
- **Price:** Prefer sale / price-drop **$599** over retail **$719** when both appear.
- **Watch type:** “vintage GMT” in the model name must **not** imply vintage watch type.

### SKX013 & 007 bundle

- Title-only listing.
- **Infer Seiko** from SKX references.
- **Bundle:** true.
- **Price:** $900.
- **Condition:** very good.

### Custom/mod watches

- **Bundle:** true.
- **Price:** $160 each (or per-unit semantics).
- **Brand:** unknown / blank (reviewer marks brand unknown).
- **Refs:** blank.
- **Condition:** unknown.

### Sternglas Hamburg Chrono & Naos

- **Bundle:** true (two watches).
- **Brand:** Sternglas.
- **Price:** $275 total.

### LM Linen Blue Dial

- Must **not** pick shipping **$50** as the listing price.
- Should pick **320 USD** as price.
- **Brand:** likely Seiko Lord Matic (“LM”).

### Omega seller bio false positive

- Seller bio mentions r/tudor, many brands, multiple listings, references.
- A **single Omega** listing must **not** be flagged bundle / multi-brand from bio noise alone.

### Glashütte Original wholesale

- Phrase like **“WHOLESALE for $9,800”** must **not** trigger bundle detection.

### Trade targets

- Lines such as **“Trades: Rolex, AP, Patek”** must **not** count as inventory / multi-brand mentions.

### Tudor Pelagos FXD — emoji keycap price

- Title may encode dollars with **keycap digits**, e.g. `$3️⃣,1️⃣0️⃣0️⃣` meaning **$3,100**.
- Parser must normalize these to ASCII digits before price extraction.

### Zodiac Aerospace GMT

- **Price:** unknown — seller says they do not know how to value it and asks for offers; **do not infer** a numeric price.
- **Brand:** Zodiac.
- **Condition:** fair (e.g. runs several minutes fast per hour, crown falls out, missing links).
- **Watch type:** vintage.
- **Sold:** true when OP adds an **[SOLD]** comment (or equivalent).

## Admin review: multi-brand queue

- Multiple brand hits from title/description are flagged for human review.
- Reviewers can mark **multi-brand mentions reviewed** when extra brands are harmless noise (trade targets, seller bio, comparisons/homages, strap compatibility, subreddit references). That clears the row from the Multi-brand and **All flagged** queues without changing listing fields.
