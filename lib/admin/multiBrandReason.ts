/** Whether the review UI should show an unresolved multi-brand mention flag. */
export function shouldFlagMultiBrandReason(
  brandHitCount: number,
  multiBrandReviewed: boolean,
): boolean {
  return brandHitCount >= 2 && !multiBrandReviewed;
}
