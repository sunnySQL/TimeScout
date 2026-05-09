/**
 * Top-level local ML classifier entry point.
 *
 * Runs all four classifiers and returns their predictions. Each field
 * returns { label, confidence } or null. Caller decides the confidence
 * threshold and which fields to persist.
 */

import type { Prediction } from "./logistic";
import { classifyCondition } from "./classifiers/condition";
import { classifyWatchType } from "./classifiers/watchType";
import { classifyBrand } from "./classifiers/brand";
import { classifyReference } from "./classifiers/reference";

export type LocalClassification = {
  condition: Prediction | null;
  watchType: Prediction | null;
  brand: Prediction | null;
  reference: Prediction | null;
};

/**
 * Classify a listing using the local TF-IDF + Logistic Regression models.
 * All four models run independently; each returns null when the model file
 * is missing or when no confident prediction can be made.
 *
 * Total wall-time is typically <5ms (models are cached after first load).
 */
export function classifyLocal(input: {
  title: string;
  body?: string | null;
}): LocalClassification {
  return {
    condition: classifyCondition(input.title, input.body),
    watchType: classifyWatchType(input.title, input.body),
    brand: classifyBrand(input.title, input.body),
    reference: classifyReference(input.title, input.body),
  };
}

/**
 * Returns true if all four model files are loadable.
 */
export function isLocalAvailable(): boolean {
  try {
    const { loadModel } = require("./loader") as typeof import("./loader");
    return (
      loadModel("condition") !== null &&
      loadModel("watch_type") !== null &&
      loadModel("brand_disambiguator") !== null &&
      loadModel("reference_scorer") !== null
    );
  } catch {
    return false;
  }
}
