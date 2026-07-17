import { describe, expect, it } from "@jest/globals";
import {
  courierBookingSchema,
  manualShipmentSchema,
  normalizeShiprocketStatus,
} from "../src/modules/fulfillment/fulfillment.policy.js";
import {
  hashWebhookBody,
  parseShiprocketWebhook,
  verifyCourierWebhookToken,
} from "../src/modules/fulfillment/courierTracking.js";
import { externalCourierOrderRef } from "../src/modules/fulfillment/courierBooking.service.js";

describe("manual shipment policy", () => {
  it("normalizes safe dispatch input", () => {
    const result = manualShipmentSchema.parse({
      carrier: "  Delhivery  ",
      service: " Surface ",
      trackingNumber: " AWB-123/45 ",
      trackingUrl: "https://www.delhivery.com/track/AWB-123",
      estimatedDeliveryAt: "2026-07-20T12:00:00.000Z",
      note: " Handed to courier ",
    });

    expect(result.carrier).toBe("Delhivery");
    expect(result.service).toBe("Surface");
    expect(result.trackingNumber).toBe("AWB-123/45");
    expect(result.trackingUrl).toBe(
      "https://www.delhivery.com/track/AWB-123",
    );
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date);
    expect(result.note).toBe("Handed to courier");
  });

  it("rejects non-http tracking links", () => {
    const result = manualShipmentSchema.safeParse({
      carrier: "Delhivery",
      trackingNumber: "AWB12345",
      trackingUrl: "javascript:alert(1)",
    });

    expect(result.success).toBe(false);
  });

  it("rejects tracking numbers containing spaces or shell characters", () => {
    for (const trackingNumber of ["AWB 123", "AWB;123", "$(bad)"]) {
      expect(
        manualShipmentSchema.safeParse({
          carrier: "Delhivery",
          trackingNumber,
        }).success,
      ).toBe(false);
    }
  });

  it("requires a carrier and a meaningful tracking number", () => {
    expect(
      manualShipmentSchema.safeParse({
        carrier: "",
        trackingNumber: "1",
      }).success,
    ).toBe(false);
  });
});

describe("courier integration policy", () => {
  it("accepts bounded parcel dimensions and an optional numeric courier id", () => {
    expect(
      courierBookingSchema.parse({
        weightKg: 0.5,
        lengthCm: 15,
        breadthCm: 10,
        heightCm: 8,
        courierId: "10",
        pickupDate: "2026-07-20",
      }),
    ).toEqual({
      weightKg: 0.5,
      lengthCm: 15,
      breadthCm: 10,
      heightCm: 8,
      courierId: "10",
      pickupDate: "2026-07-20",
    });
  });

  it("rejects impossible package values and malformed courier ids", () => {
    expect(
      courierBookingSchema.safeParse({
        weightKg: 0,
        lengthCm: 15,
        breadthCm: 10,
        heightCm: 8,
      }).success,
    ).toBe(false);
    expect(
      courierBookingSchema.safeParse({
        weightKg: 1,
        lengthCm: 15,
        breadthCm: 10,
        heightCm: 8,
        courierId: "10;drop",
      }).success,
    ).toBe(false);
  });

  it("normalizes provider statuses without leaking provider strings", () => {
    expect(normalizeShiprocketStatus("Out For Delivery")).toBe(
      "OUT_FOR_DELIVERY",
    );
    expect(normalizeShiprocketStatus("rto_in_transit")).toBe(
      "RTO_IN_TRANSIT",
    );
    expect(normalizeShiprocketStatus("unknown future state")).toBeNull();
  });

  it("compares webhook tokens safely and rejects missing values", () => {
    expect(
      verifyCourierWebhookToken(
        "0123456789abcdef",
        "0123456789abcdef",
      ),
    ).toBe(true);
    expect(
      verifyCourierWebhookToken(
        "0123456789abcdeg",
        "0123456789abcdef",
      ),
    ).toBe(false);
    expect(verifyCourierWebhookToken(undefined, "secret")).toBe(false);
  });

  it("normalizes a Shiprocket webhook into an internal tracking event", () => {
    const event = parseShiprocketWebhook(
      {
        awb: "AWB123",
        shipment_id: 456,
        current_status: "Delivered",
        current_timestamp: "2026-07-20T10:30:00.000Z",
        location: "Noida",
      },
      "fallback",
    );

    expect(event).toMatchObject({
      eventId: "fallback",
      trackingNumber: "AWB123",
      providerShipmentId: "456",
      status: "DELIVERED",
      location: "Noida",
    });
  });

  it("uses deterministic bounded identifiers for webhooks and provider orders", () => {
    expect(hashWebhookBody('{"status":"Delivered"}')).toHaveLength(64);
    const reference = externalCourierOrderRef(
      "cm1234567890abcdefghijk",
      new Date("2026-07-15T10:00:00.000Z"),
    );
    expect(reference).toMatch(/^\d{20}$/);
    expect(
      externalCourierOrderRef(
        "cm1234567890abcdefghijk",
        new Date("2026-07-15T10:00:00.000Z"),
      ),
    ).toBe(reference);
  });
});
