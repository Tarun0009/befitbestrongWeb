import { describe, expect, it } from "@jest/globals";
import {
  calculateBundleAvailability,
  calculateBundlePrice,
} from "../src/modules/bundles/bundlePolicy.js";

describe("bundle pricing policy", () => {
  it("calculates a fixed-price saving", () => {
    expect(calculateBundlePrice(5000, "FIXED_PRICE", 4000)).toEqual({
      componentTotal: 5000,
      unitPrice: 4000,
      savings: 1000,
      savingsPercent: 20,
    });
  });

  it("calculates percentage savings in integer paise", () => {
    expect(calculateBundlePrice(9999, "PERCENTAGE_OFF", 15)).toEqual({
      componentTotal: 9999,
      unitPrice: 8500,
      savings: 1499,
      savingsPercent: 15,
    });
  });

  it("never prices a bundle above its components", () => {
    expect(calculateBundlePrice(5000, "FIXED_PRICE", 6000).unitPrice).toBe(5000);
    expect(calculateBundlePrice(5000, "FIXED_PRICE", 6000).savings).toBe(0);
  });

  it("uses the lowest component availability", () => {
    expect(
      calculateBundleAvailability([
        { stock: 10, quantity: 2, productActive: true },
        { stock: 3, quantity: 1, productActive: true },
      ]),
    ).toBe(3);
  });

  it("requires two active components", () => {
    expect(
      calculateBundleAvailability([
        { stock: 10, quantity: 1, productActive: true },
      ]),
    ).toBe(0);
    expect(
      calculateBundleAvailability([
        { stock: 10, quantity: 1, productActive: true },
        { stock: 10, quantity: 1, productActive: false },
      ]),
    ).toBe(0);
  });
});