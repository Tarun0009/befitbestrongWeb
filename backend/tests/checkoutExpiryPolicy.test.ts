import { describe, expect, it } from "@jest/globals";
import {
  isReservationExpired,
  reservationExpiryDeadline,
} from "../src/modules/checkout/checkoutExpiry.policy.js";

describe("checkout reservation expiry policy", () => {
  const createdAt = new Date("2026-07-16T10:00:00.000Z");

  it("calculates an explicit reservation deadline", () => {
    expect(reservationExpiryDeadline(createdAt, 15).toISOString()).toBe(
      "2026-07-16T10:15:00.000Z",
    );
  });

  it("expires only pending orders at or after their deadline", () => {
    const reservationExpiresAt = reservationExpiryDeadline(createdAt, 15);
    expect(
      isReservationExpired({
        status: "PENDING",
        reservationExpiresAt,
        now: new Date("2026-07-16T10:15:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isReservationExpired({
        status: "PENDING",
        reservationExpiresAt,
        now: new Date("2026-07-16T10:14:59.999Z"),
      }),
    ).toBe(false);
  });

  it("never expires paid, cancelled, or undated orders", () => {
    const deadline = reservationExpiryDeadline(createdAt, 15);
    for (const status of ["PAID", "CANCELLED", "FAILED"]) {
      expect(
        isReservationExpired({ status, reservationExpiresAt: deadline, now: deadline }),
      ).toBe(false);
    }
    expect(
      isReservationExpired({
        status: "PENDING",
        reservationExpiresAt: null,
        now: deadline,
      }),
    ).toBe(false);
  });
});
