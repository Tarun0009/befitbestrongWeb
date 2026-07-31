import { describe, expect, it } from "@jest/globals";
import type { ServiceArea } from "@prisma/client";
import { HttpError } from "../src/middleware/errorHandler.js";
import {
  assertPaymentMethodAvailable,
  normalizePincode,
  requireServiceArea,
} from "../src/modules/serviceability/serviceability.service.js";

const area = {
  id: "area_test",
  pincode: "201301",
  zone: "NOIDA",
  city: "Noida",
  state: "Uttar Pradesh",
  active: true,
  prepaidEnabled: true,
  codEnabled: true,
  codMaxOrderAmount: 500_000,
  codFee: 4_900,
  estimatedDeliveryMinDays: 1,
  estimatedDeliveryMaxDays: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies ServiceArea;

describe("serviceability and payment policy", () => {
  it("accepts only exact six-digit PIN codes", () => {
    expect(normalizePincode(" 201301 ")).toBe("201301");
    for (const value of ["20130", "2013011", "012345", "ABC301", "201 301"]) {
      expect(() => normalizePincode(value)).toThrow(HttpError);
    }
  });

  it("does not gate checkout on the legacy city/PIN allow-list", async () => {
    await expect(requireServiceArea("999999")).resolves.toMatchObject({
      pincode: "999999",
      prepaidEnabled: true,
      codEnabled: false,
    });
  });

  it("does not add a fee to prepaid orders", () => {
    expect(assertPaymentMethodAvailable(area, "PREPAID", 450_000)).toEqual({
      paymentFee: 0,
      total: 450_000,
    });
  });

  it("rejects COD even when a legacy service-area row enables it", () => {
    expect(() => assertPaymentMethodAvailable(area, "COD", 100_000)).toThrow(
      HttpError,
    );
  });

  it("rejects disabled payment methods", () => {
    expect(() =>
      assertPaymentMethodAvailable(
        { ...area, prepaidEnabled: false },
        "PREPAID",
        100_000,
      ),
    ).toThrow(HttpError);
  });
});

