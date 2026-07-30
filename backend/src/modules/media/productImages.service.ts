import type { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";

export const PRODUCT_IMAGE_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: env.CLOUDINARY_HTTP_TIMEOUT_MS * 2 + 5_000,
} as const;

/** Serializes image-count and ordering changes per product across API replicas. */
export async function lockProductImageSet(
  transaction: Prisma.TransactionClient,
  productId: string,
) {
  await transaction.$queryRaw<Array<{ locked: string }>>`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`product-images/${productId}`}, 0)
    )::text AS locked
  `;
}
