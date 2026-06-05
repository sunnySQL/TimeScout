/**
 * AI-assisted extraction of structured watch listing fields.
 *
 * Used as a fallback when deterministic regex parsers and local models
 * leave fields null or approximate. Designed to be:
 *
 *   - Cheap: short prompt, JSON output, gpt-4o-mini class model
 *   - Safe: returns null for everything when OPENAI_API_KEY is missing
 *   - Honest: includes a confidence score; callers decide the threshold
 *   - Bounded: input text is truncated, output is validated
 *
 * Costs (rough): ~$0.0002 / call with gpt-4o-mini at typical lengths.
 */

import OpenAI from "openai";

const MAX_INPUT_CHARS = 4000;
const DEFAULT_MODEL = process.env.OPENAI_CLASSIFY_MODEL || "gpt-4o-mini";

/** Allowed condition values — matches the `condition` filter in search UI. */
export const AI_CONDITIONS = ["unworn", "excellent", "very good", "good", "fair"] as const;
export type AiCondition = (typeof AI_CONDITIONS)[number];

/** Allowed watch-type values — matches the `watchType` filter in search UI. */
export const AI_WATCH_TYPES = ["vintage"] as const;
export type AiWatchType = (typeof AI_WATCH_TYPES)[number];

export type AiField =
  | "brand"
  | "model"
  | "reference"
  | "price"
  | "condition"
  | "watchType"
  | "isBundle"
  | "isSold";

export type AiExtraction = {
  brand: string | null;
  model: string | null;
  reference: string | null;
  priceCents: number | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  condition: AiCondition | null;
  watchType: AiWatchType | null;
  isBundle: boolean | null;
  isSold: boolean | null;
  /** 0.00–1.00. Always present even when both fields are null. */
  confidence: number;
  /** Per-field confidence. Missing entries fall back to `confidence`. */
  fieldConfidence: Record<AiField, number>;
};

const FIELD_NAMES: AiField[] = [
  "brand",
  "model",
  "reference",
  "price",
  "condition",
  "watchType",
  "isBundle",
  "isSold",
];

const SYSTEM_PROMPT = `You extract structured fields from watch sale listings.

Return strict JSON with these fields:
  - "brand": canonical watch brand, or null
  - "model": model/family/nickname being sold, or null
  - "reference": manufacturer reference number, or null
  - "price_cents": exact asking price in USD cents, or null
  - "price_min_cents": USD cents lower bound only for an actual asking-price range, or null
  - "price_max_cents": USD cents upper bound only for an actual asking-price range, or null
  - "condition": one of "unworn", "excellent", "very good", "good", "fair", or null
  - "watch_type": one of "vintage", or null
  - "is_bundle": true, false, or null
  - "is_sold": true, false, or null
  - "confidence": float 0.0 to 1.0 (overall extraction confidence)
  - "field_confidence": object with confidence floats 0.0 to 1.0 for:
      brand, model, reference, price, condition, watch_type, is_bundle, is_sold

Scope:
  - Classify the watch being sold, not the seller, payment terms, shipping,
    trade interests, comps, retail price, warranty age, box/papers, accessories,
    service history, or comments from other users.
  - If multiple watches are being sold and they have different conditions or eras,
    return null for any field that is not clearly true for the whole listing.
  - Ignore condition words that describe only a component/accessory unless they
    clearly describe the entire watch.

BRAND / MODEL / REFERENCE rules:
  - brand must be the actual watch brand, canonicalized when obvious:
      "Tdr" or "Tudor" -> "Tudor"; "GS" -> "Grand Seiko"; "JLC" -> "Jaeger-LeCoultre";
      "GO" / "Glashutte Original" -> "Glashütte Original"; "Christopher Ward" / "CW" -> "Christopher Ward".
  - If a listing is a custom/mod watch with no true watch brand, return brand null.
    Movement names like NH34, NH35, Miyota, ETA, Sellita, or Seiko dials/mod parts
    are not automatically the watch brand.
  - model should be the model/family only, not the full title, price, condition,
    or seller prose. Examples: "Speedmaster Professional", "Seamaster Diver 300M",
    "Datejust 36", "SARB033", "Ocean 39 Vintage GMT".
  - reference should be a real reference/case/model number when present, e.g.
    "310.30.42.50.01.002", "126710BLRO", "SBGA211", "H70605732", "ZO9279".
    Do not return movement calibers (e.g. 4R35, 4R36, 3861, 3135) as reference
    unless the listing clearly uses that as the model/reference identifier.

PRICE rules:
  - price_cents is the seller's current asking price in USD cents.
  - Prefer explicit seller ask lines: "Price:", "Asking", "Priced at", "Looking to get".
  - If there is a price drop or edited current price, use the latest/current ask.
  - Ignore retail/MSRP/comps/original purchase price, shipping, label, import duties,
    taxes, insurance, card/PayPal fees, service/polish fees, and trade values.
  - "$649" -> 64900. "$7,500" -> 750000. "$4.8k" -> 480000.
  - If the only price is a Reddit flair bucket/range, return null unless the text
    itself gives the actual ask.
  - For a real asking-price range like "$500-$600 OBO", set min/max and set
    price_cents to the midpoint in cents. For multiple separately priced watches,
    return price null unless there is one total bundle price.

CONDITION rules (5 tiers, highest to lowest):
  - "unworn"    → BNIB, NIB, NOS, "never worn", "brand new", unused, tags attached,
                  still in plastic/wrap, "new condition", "10/10". The watch itself
                  has never been on a wrist.
                  IMPORTANT: "new" must describe the WATCH ITSELF. "new clasp",
                  "new strap", "new battery", "new crystal", "new warranty card",
                  or "dated 2025/2026" do NOT mean unworn.
  - "excellent" → mint, near mint, pristine, flawless, immaculate, "no scratches",
                  "perfect condition", "beautiful condition", safe queen, "9.5/10",
                  "like new" with no wear described. Worn, but visually near-new.
  - "very good" → "excellent condition" with caveats ("minor scratches", "light wear"),
                  lightly worn, well maintained, well kept, minimal signs of use, VG+,
                  "very clean", hairlines, "great condition", "9/10", "8.5/10".
                  KEY: if seller says "excellent" but also mentions ANY wear/marks,
                  this is "very good", not "excellent".
  - "good"      → daily driver, some scratches, normal wear, regular wear, desk diver,
                  signs of wear, been worn, well worn, everyday use, "8/10", "7/10".
                  Do NOT classify as "good" just because the word "used" appears
                  incidentally (e.g. "can be used as", "used to own").
  - "fair"      → explicit "fair condition" / "in fair condition", beater, project watch,
                  for parts, heavy wear, needs service/repair, rough condition, damaged,
                  dented, cracked, not running, crown/stem problems, "6/10" or below.
  - null        → genuinely cannot tell from the listing text.

Condition cautions:
  - "serviced", "running well", "keeps time", "full kit", and "watch only" are not
    cosmetic condition labels by themselves.
  - "box is excellent", "strap is unworn", "crystal is clean", or "bracelet like new"
    do not determine the whole watch condition unless the listing says the watch
    itself is in that condition.
  - If the listing only says "make an offer", "sold", or gives no asking price,
    that does not imply any condition.

WATCH_TYPE rules:
  - "vintage" → the watch itself is described as vintage/antique, OR the watch is
                clearly pre-1980 by production date/era (e.g. 1969, 1970s, 1981
                is old but not pre-1980; use null unless the text says vintage).
                A vintage watch can ALSO have any condition. NOS can be vintage
                only when old stock / old production era is clear.
  - null      → modern, current-production, recent warranty date, unknown era, or
                any case where "vintage" is only a style/marketing word.

Watch-type cautions:
  - Do NOT return "vintage" for "vintage style", "vintage-inspired", "heritage",
    "retro", "homage", "aged lume", "fauxtina", "vintage-toned lume", "no wave",
    "special edition", or a model name containing "vintage" when the watch is modern.
  - If the listing says 2020/2021/2022/2023/2024/2025/2026, warranty dated recently,
    or current model/full AD kit, return null for watch_type unless it explicitly
    says the watch itself is a vintage watch.

BUNDLE rules:
  - is_bundle true when the listing sells multiple watches, a collection, lot, bundle,
    pair, two watches, several watches, or separately priced watches in one post.
  - is_bundle false for one watch plus accessories: full set, box/papers, extra links,
    extra straps, bracelet + leather strap, OEM strap, travel case, manuals, hang tags.
  - is_bundle null when unclear.

SOLD rules:
  - is_sold true for SOLD flair, "[SOLD]", "sold to u/...", "watch has sold",
    "pending funds" after a buyer is named, or OP comments confirming a sale.
  - is_sold false only when the seller clearly says it is still available.
  - is_sold null when there is no clear signal.

CONFIDENCE rules:
  - 0.9+ → explicit phrase ("excellent condition", "BNIB", "vintage")
  - 0.7  → strong inference from multiple signals
  - 0.5  → weak signal, you're guessing
  - <0.5 → don't bother, return null instead

Examples:
  - "brand new 2025 Omega, box and papers, Price: $7,500" → brand "Omega", price_cents 750000, condition "unworn", watch_type null
  - "vintage style waffle strap" → watch_type null, is_bundle false
  - "1970s Omega Seamaster, serviced" → condition null, watch_type "vintage"
  - "excellent condition with light scratches" → condition "very good"
  - "crown falls out, running minutes off per hour" → condition "fair"
  - "Full set + extra leather strap" → is_bundle false
  - "Sternglas Hamburg Chrono & Naos Automatik Bronze ($275 total)" → brand "Sternglas", is_bundle true, price_cents 27500
  - "Watch collection sale: Omega $5999, Breitling $2399, Grand Seiko $4999" → is_bundle true, price null

Be conservative. When in doubt, return null. Do NOT hallucinate condition
from price, brand prestige, or photos. Only use words in the listing text.
If the listing text is very short (title only, no description), prefer null
over guessing — a title like "Sinn 556I, new clasp" tells you nothing
about the watch's condition.`;

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

export function isAiAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function truncate(text: string, max = MAX_INPUT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

function normalizeString(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (/^(?:unknown|n\/a|null|none|not sure)$/i.test(trimmed)) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeCents(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const cents = Math.round(raw);
  if (cents < 1_000 || cents > 1_000_000_000) return null;
  return cents;
}

function normalizeBoolean(raw: unknown): boolean | null {
  return typeof raw === "boolean" ? raw : null;
}

function normalizeConfidence(raw: unknown): number {
  let confidence = typeof raw === "number" ? raw : 0;
  if (!Number.isFinite(confidence)) confidence = 0;
  return Math.max(0, Math.min(1, confidence));
}

function validate(raw: unknown): AiExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const brand = normalizeString(obj.brand, 64);
  const model = normalizeString(obj.model, 256);
  const reference = normalizeString(obj.reference, 64);

  let priceCents = normalizeCents(obj.price_cents ?? obj.priceCents);
  const priceMinCents = normalizeCents(obj.price_min_cents ?? obj.priceMinCents);
  const priceMaxCents = normalizeCents(obj.price_max_cents ?? obj.priceMaxCents);
  if (priceCents == null && priceMinCents != null && priceMaxCents != null) {
    priceCents = Math.round((priceMinCents + priceMaxCents) / 2);
  }

  const cond = obj.condition;
  const wt = obj.watch_type ?? obj.watchType;
  const conf = obj.confidence;

  const condition: AiCondition | null =
    typeof cond === "string" && (AI_CONDITIONS as readonly string[]).includes(cond)
      ? (cond as AiCondition)
      : null;

  const watchType: AiWatchType | null =
    typeof wt === "string" && (AI_WATCH_TYPES as readonly string[]).includes(wt)
      ? (wt as AiWatchType)
      : null;

  const isBundle = normalizeBoolean(obj.is_bundle ?? obj.isBundle);
  const isSold = normalizeBoolean(obj.is_sold ?? obj.isSold);

  const confidence = normalizeConfidence(conf);
  const rawFieldConfidence =
    (obj.field_confidence ?? obj.fieldConfidence) as Record<string, unknown> | undefined;
  const fieldConfidence = Object.fromEntries(
    FIELD_NAMES.map((field) => {
      const rawKey = field === "watchType" ? "watch_type" : field === "isBundle" ? "is_bundle" : field === "isSold" ? "is_sold" : field;
      return [
        field,
        normalizeConfidence(rawFieldConfidence?.[field] ?? rawFieldConfidence?.[rawKey] ?? confidence),
      ];
    }),
  ) as Record<AiField, number>;

  return {
    brand,
    model,
    reference,
    priceCents,
    priceMinCents,
    priceMaxCents,
    condition,
    watchType,
    isBundle,
    isSold,
    confidence,
    fieldConfidence,
  };
}

export function aiFieldConfidence(result: AiExtraction, field: AiField): number {
  return result.fieldConfidence[field] ?? result.confidence;
}

export function hasUsableAiExtraction(
  result: AiExtraction,
  minConfidence: number,
): boolean {
  return (
    (result.brand != null && aiFieldConfidence(result, "brand") >= minConfidence) ||
    (result.model != null && aiFieldConfidence(result, "model") >= minConfidence) ||
    (result.reference != null && aiFieldConfidence(result, "reference") >= minConfidence) ||
    (result.priceCents != null && aiFieldConfidence(result, "price") >= minConfidence) ||
    (result.condition != null && aiFieldConfidence(result, "condition") >= minConfidence) ||
    (result.watchType != null && aiFieldConfidence(result, "watchType") >= minConfidence) ||
    (result.isBundle === true && aiFieldConfidence(result, "isBundle") >= minConfidence) ||
    (result.isSold === true && aiFieldConfidence(result, "isSold") >= minConfidence)
  );
}

/**
 * Extract structured fields from a single listing. Returns null when AI is
 * unavailable (no API key) or the API call fails. Failures are swallowed
 * by design — AI is a best-effort enrichment, never a blocker.
 */
export async function classifyListing(input: {
  title: string;
  body?: string | null;
  opComment?: string | null;
}): Promise<AiExtraction | null> {
  const client = getClient();
  if (!client) return null;

  const text = truncate(
    [input.title, input.body, input.opComment].filter(Boolean).join("\n\n"),
  );
  if (!text.trim()) return null;

  try {
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });

    const content = res.choices[0]?.message?.content;
    if (!content) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }

    return validate(parsed);
  } catch {
    return null;
  }
}
