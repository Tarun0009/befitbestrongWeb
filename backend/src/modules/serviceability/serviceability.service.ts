import { createHash } from "node:crypto";
import type { PaymentMethod, Prisma, ServiceArea } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";

const PINCODE_PATTERN = /^\d{6}$/;

export type ServiceabilityResult =
  | { serviceable: false; pincode: string }
  | {
      serviceable: true;
      pincode: string;
      zone: ServiceArea["zone"];
      city: string;
      state: string;
      prepaidEnabled: boolean;
      codEnabled: boolean;
      codMaxOrderAmount: number;
      codFee: number;
      estimatedDeliveryMinDays: number;
      estimatedDeliveryMaxDays: number;
    };

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
  const area = await prisma.serviceArea.findFirst({
    where: { pincode, active: true },
  });

  if (!area) return { serviceable: false, pincode };

  return {
    serviceable: true,
    pincode,
    zone: area.zone,
    city: area.city,
    state: area.state,
    prepaidEnabled: area.prepaidEnabled,
    codEnabled: area.codEnabled,
    codMaxOrderAmount: area.codMaxOrderAmount,
    codFee: area.codFee,
    estimatedDeliveryMinDays: area.estimatedDeliveryMinDays,
    estimatedDeliveryMaxDays: area.estimatedDeliveryMaxDays,
  };
}

export async function requireServiceArea(value: string): Promise<ServiceArea> {
  const pincode = normalizePincode(value);
  const area = await prisma.serviceArea.findFirst({
    where: { pincode, active: true },
  });
  if (!area) {
    throw new HttpError(
      422,
      "area_not_serviceable",
      "We do not deliver to this PIN code yet. You can request service in your area.",
    );
  }
  return area;
}

export function assertPaymentMethodAvailable(
  area: ServiceArea,
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

  if (!area.codEnabled) {
    throw new HttpError(
      422,
      "cod_unavailable",
      "Cash on delivery is not available for this PIN code",
    );
  }

  const total = amountBeforeFee + area.codFee;
  if (total > area.codMaxOrderAmount) {
    throw new HttpError(
      422,
      "cod_limit_exceeded",
      "Cash on delivery is available up to ₹" +
        Math.floor(area.codMaxOrderAmount / 100).toLocaleString("en-IN") +
        " for this PIN code",
    );
  }

  return { paymentFee: area.codFee, total };
}

function requesterHash(pincode: string, identity: string) {
  return createHash("sha256")
    .update("service-area-request:" + pincode + ":" + identity)
    .digest("hex");
}

export async function recordServiceAreaRequest(input: {
  pincode: string;
  userId: string | null;
  accountEmail: string | null;
  email?: string | null;
  phone?: string | null;
  productId?: string | null;
  source: string;
}) {
  const pincode = normalizePincode(input.pincode);
  const supported = await prisma.serviceArea.findFirst({
    where: { pincode, active: true },
    select: { id: true },
  });
  if (supported) {
    throw new HttpError(
      409,
      "area_already_serviceable",
      "Good news — delivery is already available for this PIN code",
    );
  }

  const email = (input.accountEmail ?? input.email)?.trim().toLowerCase() ?? null;
  if (!input.userId && !email) {
    throw new HttpError(
      400,
      "contact_required",
      "Enter an email so we can notify you when delivery opens",
    );
  }

  if (input.productId) {
    const productExists = await prisma.product.count({
      where: { id: input.productId, active: true },
    });
    if (!productExists) {
      throw new HttpError(404, "product_not_found", "Product not found");
    }
  }

  const identity = input.userId
    ? "user:" + input.userId
    : "email:" + email;
  const hash = requesterHash(pincode, identity);

  const request = await prisma.serviceAreaRequest.upsert({
    where: {
      pincode_requesterHash: {
        pincode,
        requesterHash: hash,
      },
    },
    update: {
      attemptCount: { increment: 1 },
      lastRequestedAt: new Date(),
      email,
      phone: input.phone?.trim() || null,
      productId: input.productId ?? null,
      source: input.source,
    },
    create: {
      pincode,
      requesterHash: hash,
      email,
      phone: input.phone?.trim() || null,
      userId: input.userId,
      productId: input.productId ?? null,
      source: input.source,
    },
    select: { id: true, pincode: true, createdAt: true },
  });

  return request;
}

export type ServiceabilityTx = Prisma.TransactionClient;

