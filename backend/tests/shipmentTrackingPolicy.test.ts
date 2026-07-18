import { describe, expect, it } from "@jest/globals";
import type { ShipmentStatus } from "@prisma/client";
import {
  canShipmentTransition,
  SHIPMENT_TRANSITIONS,
} from "../src/modules/fulfillment/fulfillment.policy.js";

describe("shipment tracking state policy", () => {
  it("allows normal forward delivery progress", () => {
    expect(canShipmentTransition("LABEL_CREATED", "PICKED_UP")).toBe(true);
    expect(canShipmentTransition("IN_TRANSIT", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canShipmentTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
  });

  it("allows a provider to skip directly to delivered", () => {
    expect(canShipmentTransition("LABEL_CREATED", "DELIVERED")).toBe(true);
    expect(canShipmentTransition("PICKED_UP", "DELIVERED")).toBe(true);
  });

  it("rejects regressions and terminal-state changes", () => {
    expect(canShipmentTransition("DELIVERED", "IN_TRANSIT")).toBe(false);
    expect(canShipmentTransition("RETURNED", "DELIVERED")).toBe(false);
    expect(canShipmentTransition("CANCELLED", "LABEL_CREATED")).toBe(false);
  });

  it("does not expose self transitions as forward moves", () => {
    for (const [from, allowed] of Object.entries(SHIPMENT_TRANSITIONS)) {
      expect(allowed).not.toContain(from as ShipmentStatus);
    }
  });
});
