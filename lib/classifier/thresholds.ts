/**
 * Per-field confidence thresholds for the local ML classifier.
 *
 * Brand and reference are set high (0.88) because wrong values are worse
 * than missing values — they corrupt search, filters, and training data.
 * Condition and watch type are more forgiving at 0.60.
 */
export const LOCAL_THRESHOLDS = {
  condition: 0.60,
  watchType: 0.60,
  brand: 0.88,
  reference: 0.88,
} as const;

/**
 * Sources that can appear in *_source columns.
 * "legacy" marks pre-provenance rows where the true origin is unknown.
 */
export type ClassifierSource = "regex" | "local" | "ai" | "manual" | "legacy";

/** Field-level provenance columns written alongside a classification value. */
export type FieldProvenance = {
  source: ClassifierSource;
  confidence: number | null;
};
