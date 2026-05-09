/**
 * Local reference number scorer.
 *
 * Generates candidate reference-shaped tokens from the listing title using
 * regex patterns, then scores each with the trained binary model. Returns
 * the highest-scoring candidate above threshold.
 */

import { normalizeText } from "../features";
import { transform } from "../tfidf";
import { predict, type Prediction } from "../logistic";
import { loadModel } from "../loader";

const REF_PATTERNS = [
  /\b\d{4,6}[A-Z]{0,4}(?:-\d{1,4})?\b/g,
  /\b[A-Z]{2,4}\d{3,6}[A-Z0-9]*\b/g,
  /\b\d{3,5}-\d{3,5}[A-Z0-9]*\b/g,
];

const YEAR_RE = /^(19|20)\d{2}$/;

function findRefCandidates(rawTitle: string): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const pattern of REF_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(rawTitle)) !== null) {
      const token = m[0];
      if (YEAR_RE.test(token)) continue;
      if (token.length < 3) continue;
      if (!seen.has(token)) {
        seen.add(token);
        candidates.push(token);
      }
    }
  }
  return candidates;
}

export function classifyReference(
  title: string,
  body?: string | null,
): Prediction | null {
  const model = loadModel("reference_scorer");
  if (!model) return null;

  const candidates = findRefCandidates(title);
  if (candidates.length === 0) return null;

  const text = normalizeText(title, body);
  let best: Prediction | null = null;

  for (const cand of candidates) {
    const input = `${text} __REF__ ${cand.toLowerCase()}`;
    const vec = transform(model, input);
    const pred = predict(model, vec);

    if (pred.label !== "correct_ref") continue;
    if (!best || pred.confidence > best.confidence) {
      best = {
        label: cand,
        confidence: pred.confidence,
        probabilities: pred.probabilities,
      };
    }
  }

  return best;
}
