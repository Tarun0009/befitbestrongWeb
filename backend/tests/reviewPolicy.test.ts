import { describe, expect, it } from "@jest/globals";
import { decideReviewEligibility } from "../src/modules/reviews/reviewPolicy.js";

describe("review eligibility policy", () => {
  it("allows a delivered purchaser without an existing review", () => {
    expect(
      decideReviewEligibility({
        hasDeliveredPurchase: true,
        hasExistingReview: false,
      }),
    ).toEqual({ eligible: true, reason: "eligible" });
  });

  it("blocks customers without a delivered purchase", () => {
    expect(
      decideReviewEligibility({
        hasDeliveredPurchase: false,
        hasExistingReview: false,
      }),
    ).toEqual({
      eligible: false,
      reason: "no_delivered_purchase",
    });
  });

  it("enforces one review per customer and product", () => {
    expect(
      decideReviewEligibility({
        hasDeliveredPurchase: true,
        hasExistingReview: true,
      }),
    ).toEqual({ eligible: false, reason: "already_reviewed" });
  });

  it("does not leak purchase state when a review already exists", () => {
    expect(
      decideReviewEligibility({
        hasDeliveredPurchase: false,
        hasExistingReview: true,
      }),
    ).toEqual({ eligible: false, reason: "already_reviewed" });
  });
});
