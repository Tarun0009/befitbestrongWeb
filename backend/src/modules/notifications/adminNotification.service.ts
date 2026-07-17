import type {
  AdminNotificationType,
  Prisma,
} from "@prisma/client";

export async function createOrderAdminNotification(
  tx: Prisma.TransactionClient,
  input: {
    type: AdminNotificationType;
    orderId: string;
    total: number;
    currency: string;
    contactEmail: string;
  },
) {
  const isCod = input.type === "ORDER_COD_PLACED";
  const title = isCod ? "New COD order" : "Payment confirmed";
  const message =
    "Order #" +
    input.orderId.slice(-8).toUpperCase() +
    " from " +
    input.contactEmail +
    " · " +
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: input.currency,
    }).format(input.total / 100);

  return tx.adminNotification.upsert({
    where: {
      type_orderId: {
        type: input.type,
        orderId: input.orderId,
      },
    },
    update: {},
    create: {
      type: input.type,
      orderId: input.orderId,
      title,
      message,
      metadata: {
        paymentMethod: isCod ? "COD" : "PREPAID",
      },
    },
  });
}

