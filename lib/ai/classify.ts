/**
 * AI-assisted classification of watch condition + watch_type.
 *
 * Used as a fallback when the deterministic regex parsers
 * (`extractCondition`, `extractWatchType`) return null. Designed to be:
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

export type AiClassification = {
  condition: AiCondition | null;
  watchType: AiWatchType | null;
  /** 0.00–1.00. Always present even when both fields are null. */
  confidence: number;
};

const SYSTEM_PROMPT = `You classify watch listings into a fixed taxonomy.

Return strict JSON with these fields:
  - "condition": one of "unworn", "excellent", "very good", "good", "fair", or null
  - "watch_type": one of "vintage", or null
  - "confidence": float 0.0 to 1.0 (your overall confidence in BOTH fields)

CONDITION rules (5 tiers, highest to lowest):
  - "unworn"    → BNIB, LNIB, NOS, "never worn", "brand new", unused, tags attached,
                  still in plastic/wrap, "new condition", "10/10". Never been on a wrist.
                  IMPORTANT: "new" must describe the WATCH ITSELF, not parts or accessories.
                  "new clasp", "new strap", "new battery", "new crystal" do NOT mean unworn.
  - "excellent" → mint, near mint, pristine, flawless, immaculate, "no scratches",
                  "perfect condition", "beautiful condition", safe queen, "9.5/10".
                  Worn but indistinguishable from new.
  - "very good" → "excellent condition" with caveats ("minor scratches", "light wear"),
                  lightly worn, well maintained, well kept, minimal signs of use, VG+,
                  "very clean", hairlines, "great condition", "9/10", "8.5/10".
                  KEY: if seller says "excellent" but also mentions ANY wear/marks, this
                  is "very good", not "excellent".
  - "good"      → daily driver, some scratches, normal wear, regular wear, desk diver,
                  signs of wear, been worn, well worn, everyday use, "8/10", "7/10".
                  Do NOT classify as "good" just because the word "used" appears
                  incidentally (e.g. "can be used as", "used to own").
  - "fair"      → explicit "fair condition" / "in fair condition", beater, project watch,
                  for parts, heavy wear, needs service/repair, rough condition, damaged,
                  dented, cracked, not running, "6/10" or below.
  - null        → genuinely cannot tell from the listing text.

WATCH_TYPE rules:
  - "vintage" → described as vintage / antique, OR clearly pre-1980s by date.
                A vintage watch can ALSO have any condition. NOS counts as vintage.
  - null      → modern / unknown era

CONFIDENCE rules:
  - 0.9+ → explicit phrase ("excellent condition", "BNIB", "vintage")
  - 0.7  → strong inference from multiple signals
  - 0.5  → weak signal, you're guessing
  - <0.5 → don't bother, return null instead

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

function validate(raw: unknown): AiClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

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

  let confidence = typeof conf === "number" ? conf : 0;
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));

  return { condition, watchType, confidence };
}

/**
 * Classify a single listing. Returns null when the classifier is
 * unavailable (no API key) or the API call fails. Failures are swallowed
 * by design — AI is a best-effort enrichment, never a blocker.
 */
export async function classifyListing(input: {
  title: string;
  body?: string | null;
  opComment?: string | null;
}): Promise<AiClassification | null> {
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
