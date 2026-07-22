import { describe, expect, it } from "@jest/globals";
import {
  checkoutKeyHash,
  checkoutOwnerHash,
  checkoutRequestHash,
} from "../src/modules/checkout/checkoutIdempotency.policy.js";

const request = {
  userId: null,
  contactEmail: "buyer@example.com",
  couponCode: "WELCOME",
  paymentMethod: "COD" as const,
  cartRevision: "cart-revision-7",
  address: {
    fullName: "Test Buyer",
    phone: "9876543210",
    line1: "1 Test Street",
    line2: null,
    city: "Noida",
    state: "Uttar Pradesh",
    pincode: "201301",
    country: "IN",
  },
};

describe("checkout idempotency policy", () => {
  it("normalizes equivalent request values before hashing", () => {
    expect(checkoutRequestHash(request)).toBe(
      checkoutRequestHash({
        ...request,
        contactEmail: " Buyer@Example.com ",
        couponCode: " welcome ",
        address: { ...request.address, line2: "  " },
      }),
    );
  });

  it("changes the request hash when commercial or delivery intent changes", () => {
    expect(
      checkoutRequestHash({ ...request, paymentMethod: "PREPAID" }),
    ).not.toBe(checkoutRequestHash(request));
    expect(
      checkoutRequestHash({
        ...request,
        address: { ...request.address, pincode: "110001" },
      }),
    ).not.toBe(checkoutRequestHash(request));
    expect(
      checkoutRequestHash({ ...request, cartRevision: "cart-revision-8" }),
    ).not.toBe(checkoutRequestHash(request));
  });

  it("scopes the same key to different cart owners", () => {
    expect(checkoutOwnerHash({ type: "guest", id: "guest-a" })).not.toBe(
      checkoutOwnerHash({ type: "guest", id: "guest-b" }),
    );
    expect(checkoutOwnerHash({ type: "guest", id: "shared" })).not.toBe(
      checkoutOwnerHash({ type: "user", id: "shared" }),
    );
  });

  it("stores only a deterministic digest of the client key", () => {
    const key = "a".repeat(64);
    expect(checkoutKeyHash(key)).toHaveLength(64);
    expect(checkoutKeyHash(key)).toBe(checkoutKeyHash(key));
    expect(checkoutKeyHash(key)).not.toContain(key);
  });
});
