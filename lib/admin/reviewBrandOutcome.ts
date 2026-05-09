/** Resolved reviewer intent for the brand field (listing-side effect differs per kind). */
export type BrandReviewOutcomeKind = "unset" | "unknown" | "value";

export function brandReviewOutcomeFromForm(
  trimmedBrand: string,
  brandUnknownChecked: boolean,
): BrandReviewOutcomeKind {
  if (trimmedBrand) return "value";
  if (brandUnknownChecked) return "unknown";
  return "unset";
}

export function brandReviewOutcomeKey(kind: BrandReviewOutcomeKind, brand?: string): string {
  if (kind === "value") return `value:${brand ?? ""}`;
  return kind;
}
