import { env } from "../../config/env.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { CourierProvider } from "./courier.types.js";
import { shiprocketProvider } from "./shiprocket.provider.js";

export function getConfiguredCourierProvider(): CourierProvider {
  if (env.COURIER_PROVIDER === "shiprocket" && shiprocketProvider.configured) {
    return shiprocketProvider;
  }
  throw new HttpError(
    503,
    "courier_not_configured",
    "Automated courier booking is not configured; use manual dispatch",
  );
}

export function courierConfiguration() {
  return {
    provider: env.COURIER_PROVIDER,
    configured:
      env.COURIER_PROVIDER === "shiprocket" && shiprocketProvider.configured,
    manualFallback: true,
  };
}
