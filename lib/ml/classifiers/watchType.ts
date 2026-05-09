/**
 * Local watch-type classifier: vintage | null.
 *
 * The model has two classes: ["modern", "vintage"]. We only surface a
 * prediction when the model says "vintage" with sufficient confidence;
 * "modern" is the absence of a type tag, not a label we store.
 */

import { normalizeText } from "../features";
import { transform } from "../tfidf";
import { predict, type Prediction } from "../logistic";
import { loadModel } from "../loader";

export function classifyWatchType(
  title: string,
  body?: string | null,
): Prediction | null {
  const model = loadModel("watch_type");
  if (!model) return null;

  const text = normalizeText(title, body);
  const vec = transform(model, text);
  const pred = predict(model, vec);

  if (pred.label !== "vintage") return null;
  return pred;
}
