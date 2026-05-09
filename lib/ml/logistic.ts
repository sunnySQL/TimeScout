/**
 * Pure-TS port of sklearn LogisticRegression.predict_proba().
 *
 * Supports both binary and multinomial LR. Operates on sparse vectors
 * to avoid dense matrix allocation.
 */

import type { SparseVec } from "./tfidf";

export type LogRegModel = {
  classes: string[];
  /** Shape: [n_classes, n_features]. For binary, may be [1, n_features]. */
  coef: number[][];
  /** Shape: [n_classes]. For binary, may be [1]. */
  intercept: number[];
};

export type Prediction = {
  label: string;
  confidence: number;
  /** Per-class probabilities, in the same order as model.classes. */
  probabilities: number[];
};

function dotSparse(weights: number[], vec: SparseVec): number {
  let sum = 0;
  for (const [idx, val] of vec) {
    sum += (weights[idx] ?? 0) * val;
  }
  return sum;
}

function softmax(logits: number[]): number[] {
  const maxLogit = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - maxLogit));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function predict(model: LogRegModel, vec: SparseVec): Prediction {
  const nClasses = model.classes.length;

  let probs: number[];

  if (nClasses === 2 && model.coef.length === 1) {
    // Binary: sklearn stores a single weight row
    const z = dotSparse(model.coef[0], vec) + model.intercept[0];
    const p1 = sigmoid(z);
    probs = [1 - p1, p1];
  } else {
    // Multinomial
    const logits = model.coef.map(
      (w, i) => dotSparse(w, vec) + model.intercept[i],
    );
    probs = softmax(logits);
  }

  let bestIdx = 0;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[bestIdx]) bestIdx = i;
  }

  return {
    label: model.classes[bestIdx],
    confidence: probs[bestIdx],
    probabilities: probs,
  };
}
