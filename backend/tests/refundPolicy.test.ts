import { describe, expect, it } from "@jest/globals";
import {
  calculateRefundBalance,
  classifyRefundKind,
  mapProviderRefundStatus,
  nextRefundReconcileAt,
  refundRequestHash,
  refundRequestKeyHash,
} from "../src/modules/refunds/refund.policy.js";

describe("refund ledger policy", () => {
  it("reserves in-flight amounts so parallel requests cannot spend them", () => {
    expect(
      calculateRefundBalance(10_000, [
        { amount: 2_000, status: "PROCESSED" },
        { amount: 3_000, status: "PENDING" },
        { amount: 1_000, status: "RECONCILIATION_REQUIRED" },
      ]),
    ).toEqual({
      processedAmount: 2_000,
      reservedAmount: 6_000,
      refundableAmount: 4_000,
      fullyRefunded: false,
    });
  });

  it("releases a definitively failed amount", () => {
    expect(
      calculateRefundBalance(10_000, [
        { amount: 4_000, status: "FAILED" },
      ]).refundableAmount,
    ).toBe(10_000);
  });

  it("marks fully refunded only from processed provider outcomes", () => {
    expect(
      calculateRefundBalance(10_000, [
        { amount: 10_000, status: "PENDING" },
      ]).fullyRefunded,
    ).toBe(false);
    expect(
      calculateRefundBalance(10_000, [
        { amount: 4_000, status: "PROCESSED" },
        { amount: 6_000, status: "PROCESSED" },
      ]).fullyRefunded,
    ).toBe(true);
  });

  it("classifies full and partial amounts", () => {
    expect(classifyRefundKind(10_000, 10_000)).toBe("FULL");
    expect(classifyRefundKind(4_000, 10_000)).toBe("PARTIAL");
  });

  it("maps only provider terminal and pending statuses", () => {
    expect(mapProviderRefundStatus("pending")).toBe("PENDING");
    expect(mapProviderRefundStatus("processed")).toBe("PROCESSED");
    expect(mapProviderRefundStatus("failed")).toBe("FAILED");
    expect(mapProviderRefundStatus("mystery")).toBeNull();
  });

  it("uses deterministic hashes while binding keys to request content", () => {
    expect(refundRequestKeyHash("same-key")).toBe(
      refundRequestKeyHash("same-key"),
    );
    expect(
      refundRequestHash({
        orderId: "order-1",
        amount: 500,
        currency: "inr",
        reason: " duplicate ",
      }),
    ).toBe(
      refundRequestHash({
        orderId: "order-1",
        amount: 500,
        currency: "INR",
        reason: "duplicate",
      }),
    );
  });

  it("backs off reconciliation and stops after the bounded attempt limit", () => {
    const now = new Date("2026-07-16T00:00:00.000Z");
    expect(nextRefundReconcileAt(1, now)?.getTime()).toBe(
      now.getTime() + 60_000,
    );
    expect(nextRefundReconcileAt(8, now)?.getTime()).toBe(
      now.getTime() + 3_600_000,
    );
    expect(nextRefundReconcileAt(10, now)).toBeNull();
  });
});
