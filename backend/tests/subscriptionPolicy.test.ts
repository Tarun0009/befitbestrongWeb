import { describe, expect, it } from "@jest/globals";
import {
  addFrequencyDays,
  calculateSubscriptionPrice,
} from "../src/modules/subscriptions/subscriptionPolicy.js";

describe("subscription policy", () => {
  it("calculates an integer-paise plan price", () => {
    expect(calculateSubscriptionPrice(9999, 15)).toBe(8500);
  });

  it("clamps invalid discounts", () => {
    expect(calculateSubscriptionPrice(5000, -10)).toBe(5000);
    expect(calculateSubscriptionPrice(5000, 150)).toBe(0);
  });

  it("rejects non-positive product prices", () => {
    expect(calculateSubscriptionPrice(0, 10)).toBe(0);
    expect(calculateSubscriptionPrice(-100, 10)).toBe(0);
  });

  it("advances a schedule by exact whole days", () => {
    const start = new Date("2026-01-01T12:00:00.000Z");
    expect(addFrequencyDays(start, 30).toISOString()).toBe("2026-01-31T12:00:00.000Z");
  });
});