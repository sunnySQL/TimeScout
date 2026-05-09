/**
 * Local condition classifier: unworn | excellent | used.
 */

import { normalizeText } from "../features";
import { transform } from "../tfidf";
import { predict, type Prediction } from "../logistic";
import { loadModel } from "../loader";

const VALID_CONDITIONS = new Set(["unworn", "excellent", "very good", "good", "fair"]);

export function classifyCondition(
  title: string,
  body?: string | null,
): Prediction | null {
  const model = loadModel("condition");
  if (!model) return null;

  const text = normalizeText(title, body);
  const vec = transform(model, text);
  const pred = predict(model, vec);

  if (!VALID_CONDITIONS.has(pred.label)) return null;
  return pred;
}
