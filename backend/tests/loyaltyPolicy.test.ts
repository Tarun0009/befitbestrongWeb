import { describe, expect, it } from "@jest/globals";
import {
  calculateOrderPoints,
  calculateRedemptionDiscount,
} from "../src/modules/loyalty/loyaltyPolicy.js";

describe("loyalty points policy", () => {
  it("earns configured points only for complete rupees", () => {
    expect(calculateOrderPoints(12345, 2)).toBe(246);
  });

  it("does not earn points for invalid totals or a paused earn rate", () => {
    expect(calculateOrderPoints(0, 1)).toBe(0);
    expect(calculateOrderPoints(10000, 0)).toBe(0);
    expect(calculateOrderPoints(-100, 1)).toBe(0);
  });

  it("converts an exact points increment into a paise discount", () => {
    expect(calculateRedemptionDiscount(250, 10)).toBe(2500);
  });

  it("rejects partial redemption increments", () => {
    expect(calculateRedemptionDiscount(255, 10)).toBe(0);
  });

  it("rejects invalid redemption inputs", () => {
    expect(calculateRedemptionDiscount(0, 10)).toBe(0);
    expect(calculateRedemptionDiscount(100, 0)).toBe(0);
  });
});