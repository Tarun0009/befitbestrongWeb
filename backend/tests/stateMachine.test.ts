import { describe, expect, it } from "@jest/globals";
import type { OrderStatus } from "@prisma/client";
import {
  canTransition,
  TRANSITIONS,
} from "../src/modules/orders/stateMachine.js";

// Pure-logic tests. These lock in the transition map from PLAN.md so a stray
// edit that opens (or closes) a status path fails loudly in CI instead of
// silently going to production.

describe("state machine transitions", () => {
  it("PENDING can go to PAID / CANCELLED / FAILED", () => {
    expect(canTransition("PENDING", "PAID")).toBe(true);
    expect(canTransition("PENDING", "CANCELLED")).toBe(true);
    expect(canTransition("PENDING", "FAILED")).toBe(true);
  });

  it("CONFIRMED COD can ship or cancel, but is never marked paid", () => {
    expect(canTransition("CONFIRMED", "SHIPPED")).toBe(true);
    expect(canTransition("CONFIRMED", "CANCELLED")).toBe(true);
    expect(canTransition("CONFIRMED", "PAID")).toBe(false);
  });

  it("PAID can go to SHIPPED or REFUNDED, not CANCELLED", () => {
    expect(canTransition("PAID", "SHIPPED")).toBe(true);
    expect(canTransition("PAID", "REFUNDED")).toBe(true);
    // PAID → CANCELLED is explicitly not allowed; refund is the way out.
    expect(canTransition("PAID", "CANCELLED")).toBe(false);
  });

  it("SHIPPED can only go to DELIVERED", () => {
    expect(canTransition("SHIPPED", "DELIVERED")).toBe(true);
    expect(canTransition("SHIPPED", "REFUNDED")).toBe(false);
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(false);
  });

  it("DELIVERED can only go to REFUNDED", () => {
    expect(canTransition("DELIVERED", "REFUNDED")).toBe(true);
    expect(canTransition("DELIVERED", "SHIPPED")).toBe(false);
    expect(canTransition("DELIVERED", "PENDING")).toBe(false);
  });

  it("terminal states have zero outbound transitions", () => {
    const terminals: OrderStatus[] = ["CANCELLED", "FAILED", "REFUNDED"];
    for (const t of terminals) {
      expect(TRANSITIONS[t]).toHaveLength(0);
    }
  });

  it("no status can transition to itself", () => {
    for (const [from, allowed] of Object.entries(TRANSITIONS)) {
      expect(allowed).not.toContain(from as OrderStatus);
    }
  });

  it("no status can regress to PENDING", () => {
    for (const allowed of Object.values(TRANSITIONS)) {
      expect(allowed).not.toContain("PENDING");
    }
  });

  it("delivered/refunded are absorbing states (no cross-status leaks)", () => {
    // Any status can appear on the right-hand side only from the paths we've
    // explicitly documented. This catches accidental additions.
    const legalIncoming: Record<OrderStatus, OrderStatus[]> = {
      PENDING: [],
      CONFIRMED: [],
      PAID: ["PENDING"],
      SHIPPED: ["PAID", "CONFIRMED"],
      DELIVERED: ["SHIPPED"],
      CANCELLED: ["PENDING", "CONFIRMED"],
      FAILED: ["PENDING"],
      REFUNDED: ["PAID", "DELIVERED"],
    };

    for (const to of Object.keys(legalIncoming) as OrderStatus[]) {
      const actualSources = (Object.keys(TRANSITIONS) as OrderStatus[]).filter(
        (from) => TRANSITIONS[from].includes(to),
      );
      expect(actualSources.sort()).toEqual(legalIncoming[to].sort());
    }
  });
});
