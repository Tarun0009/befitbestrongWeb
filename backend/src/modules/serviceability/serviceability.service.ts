import type { PaymentMethod, Prisma, ServiceArea } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";

const PINCODE_PATTERN = /^[1-9]\d{5}$/;

export type ServiceabilityResult =
  | { serviceable: false; pincode: string }
  | {
      serviceable: true;
      pincode: string;
      zone: ServiceArea["zone"] | null;
      city: string | null;
      state: string | null;
      prepaidEnabled: boolean;
      codEnabled: boolean;
      codMaxOrderAmount: number;
      codFee: number;
      estimatedDeliveryMinDays: number;
      estimatedDeliveryMaxDays: number;
    };

export type ServiceabilityPolicy = Pick<
  ServiceArea,
  | "pincode"
  | "prepaidEnabled"
  | "codEnabled"
  | "codMaxOrderAmount"
  | "codFee"
  | "estimatedDeliveryMinDays"
  | "estimatedDeliveryMaxDays"
>;

// Delivery is PAN India. These defaults are deliberately centralized so the
// checkout path cannot accidentally fall back to the old city/PIN allow-list.
// Amounts are stored in paise, matching the rest of the payment system.
const PAN_INDIA_POLICY = {
  prepaidEnabled: true,
  // COD is intentionally unavailable for the current launch. Keep the
  // response fields for API compatibility and historical order rendering,
  // but never advertise or authorize a new COD checkout.
  codEnabled: false,
  codMaxOrderAmount: 0,
  codFee: 0,
  estimatedDeliveryMinDays: 3,
  estimatedDeliveryMaxDays: 7,
} as const;

export function normalizePincode(value: string): string {
  const pincode = value.trim();
  if (!PINCODE_PATTERN.test(pincode)) {
    throw new HttpError(
      400,
      "invalid_pincode",
      "Enter a valid 6-digit Indian PIN code",
    );
  }
  return pincode;
}

export async function getServiceability(
  value: string,
): Promise<ServiceabilityResult> {
  const pincode = normalizePincode(value);
  // Existing service-area rows are retained as historical location metadata.
  // They are intentionally not filtered by `active` and never gate coverage.
  const area = await prisma.serviceArea.findUnique({
    where: { pincode },
    select: { zone: true, city: true, state: true },
  });

  return {
    serviceable: true,
    pincode,
    zone: area?.zone ?? null,
    city: area?.city ?? null,
    state: area?.state ?? null,
    ...PAN_INDIA_POLICY,
  };
}

export async function requireServiceArea(
  value: string,
): Promise<ServiceabilityPolicy> {
  const pincode = normalizePincode(value);
  return { pincode, ...PAN_INDIA_POLICY };
}

export function assertPaymentMethodAvailable(
  area: Pick<
    ServiceArea,
    | "prepaidEnabled"
    | "codEnabled"
    | "codMaxOrderAmount"
    | "codFee"
  >,
  paymentMethod: PaymentMethod,
  amountBeforeFee: number,
): { paymentFee: number; total: number } {
  if (paymentMethod === "PREPAID") {
    if (!area.prepaidEnabled) {
      throw new HttpError(
        422,
        "prepaid_unavailable",
        "Prepaid checkout is not available for this PIN code",
      );
    }
    return { paymentFee: 0, total: amountBeforeFee };
  }

  throw new HttpError(
    422,
    "cod_unavailable",
    "Cash on delivery is not currently available. Please pay online.",
  );
}

export type ServiceabilityTx = Prisma.TransactionClient;

