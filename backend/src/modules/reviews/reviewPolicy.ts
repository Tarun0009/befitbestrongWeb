export type ReviewEligibilityReason =
  | "eligible"
  | "already_reviewed"
  | "no_delivered_purchase";

export interface ReviewEligibilityDecision {
  eligible: boolean;
  reason: ReviewEligibilityReason;
}

export function decideReviewEligibility(input: {
  hasDeliveredPurchase: boolean;
  hasExistingReview: boolean;
}): ReviewEligibilityDecision {
  if (input.hasExistingReview) {
    return { eligible: false, reason: "already_reviewed" };
  }
  if (!input.hasDeliveredPurchase) {
    return { eligible: false, reason: "no_delivered_purchase" };
  }
  return { eligible: true, reason: "eligible" };
}
