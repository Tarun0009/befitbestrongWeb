import { describe, expect, it } from "@jest/globals";
import { shouldSendBackInStock } from "../src/modules/wishlist/stockAlertPolicy.js";

describe("back-in-stock notification policy", () => {
  it("triggers when inventory crosses from zero to available", () => {
    expect(shouldSendBackInStock(0, 1)).toBe(true);
    expect(shouldSendBackInStock(-1, 8)).toBe(true);
  });

  it("does not trigger for ordinary in-stock adjustments", () => {
    expect(shouldSendBackInStock(2, 5)).toBe(false);
    expect(shouldSendBackInStock(5, 1)).toBe(false);
  });

  it("does not trigger while inventory remains unavailable", () => {
    expect(shouldSendBackInStock(0, 0)).toBe(false);
    expect(shouldSendBackInStock(-2, 0)).toBe(false);
  });
});
