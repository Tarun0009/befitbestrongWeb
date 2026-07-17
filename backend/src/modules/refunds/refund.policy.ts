import { createHash } from "node:crypto";

export type RefundLedgerStatus =
  | "REQUESTED"
  | "PROCESSING"
  | "PENDING"
  | "PROCESSED"
  | "FAILED"
  | "RECONCILIATION_REQUIRED";

export const RESERVED_REFUND_STATUSES: readonly RefundLedgerStatus[] = [
  "REQUESTED",
  "PROCESSING",
  "PENDING",
  "PROCESSED",
  "RECONCILIATION_REQUIRED",
];

export interface RefundBalance {
  processedAmount: number;
  reservedAmount: number;
  refundableAmount: number;
  fullyRefunded: boolean;
}

export function calculateRefundBalance(
  paymentAmount: number,
  intents: ReadonlyArray<{ amount: number; status: RefundLedgerStatus }>,
): RefundBalance {
  const processedAmount = intents
    .filter((intent) => intent.status === "PROCESSED")
    .reduce((sum, intent) => sum + intent.amount, 0);
  const reservedAmount = intents
    .filter((intent) => RESERVED_REFUND_STATUSES.includes(intent.status))
    .reduce((sum, intent) => sum + intent.amount, 0);
  return {
    processedAmount,
    reservedAmount,
    refundableAmount: Math.max(0, paymentAmount - reservedAmount),
    fullyRefunded: processedAmount === paymentAmount,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function refundRequestKeyHash(key: string): string {
  return sha256(`refund-key:v1:${key}`);
}

export function refundRequestHash(input: {
  orderId: string;
  amount: number;
  currency: string;
  reason: string;
}): string {
  return sha256(
    JSON.stringify({
      orderId: input.orderId,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      reason: input.reason.trim(),
    }),
  );
}

export function classifyRefundKind(
  amount: number,
  paymentAmount: number,
): "FULL" | "PARTIAL" {
  return amount === paymentAmount ? "FULL" : "PARTIAL";
}

export function mapProviderRefundStatus(
  status: string,
): "PENDING" | "PROCESSED" | "FAILED" | null {
  if (status === "pending") return "PENDING";
  if (status === "processed") return "PROCESSED";
  if (status === "failed") return "FAILED";
  return null;
}

export function nextRefundReconcileAt(
  attemptCount: number,
  now: Date,
): Date | null {
  if (attemptCount >= 10) return null;
  const delayMs = Math.min(60_000 * 2 ** Math.max(0, attemptCount - 1), 3_600_000);
  return new Date(now.getTime() + delayMs);
}
