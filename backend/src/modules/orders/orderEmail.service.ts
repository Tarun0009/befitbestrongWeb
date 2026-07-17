import type { OrderStatus } from "@prisma/client";
import type { EmailOutboxTx } from "../notifications/emailOutbox.service.js";
import { enqueueEmail } from "../notifications/emailOutbox.service.js";

const SUBJECTS: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "Your beFitBeStrong COD order is confirmed",
  PAID: "Your beFitBeStrong order is confirmed",
  SHIPPED: "Your beFitBeStrong order has shipped",
  DELIVERED: "Your beFitBeStrong order was delivered",
  CANCELLED: "Your beFitBeStrong order was cancelled",
  FAILED: "There was a problem with your beFitBeStrong order",
  REFUNDED: "Your beFitBeStrong refund was processed",
};

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount / 100);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function queueOrderStatusEmail(
  tx: EmailOutboxTx,
  orderId: string,
  status: OrderStatus,
) {
  const subject = SUBJECTS[status];
  if (!subject) return null;
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return null;

  const itemRows = order.items
    .map((item) => {
      const snapshot = item.productSnapshot as {
        name?: string;
        size?: string | null;
        color?: string | null;
      };
      const variant = [snapshot.size, snapshot.color].filter(Boolean).join(" / ");
      return (
        "<tr><td style='padding:8px 0'>" +
        escapeHtml(snapshot.name ?? "Product") +
        (variant ? "<br><small>" + escapeHtml(variant) + "</small>" : "") +
        " × " +
        item.quantity +
        "</td><td style='padding:8px 0;text-align:right'>" +
        formatINR(item.subtotal) +
        "</td></tr>"
      );
    })
    .join("");
  const html =
    "<div style='font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f1b14'>" +
    "<div style='background:#f5b800;padding:18px 24px;font-weight:700'>beFitBeStrong</div>" +
    "<div style='padding:24px;border:1px solid #e5e0d7'>" +
    "<h1 style='font-size:24px;margin:0 0 12px'>" +
    escapeHtml(subject) +
    "</h1><p>Order <strong>" +
    escapeHtml(order.id) +
    "</strong> is now <strong>" +
    status.toLowerCase() +
    "</strong>.</p><table style='width:100%;border-collapse:collapse;margin-top:20px'>" +
    itemRows +
    "</table><p style='border-top:1px solid #e5e0d7;padding-top:16px;text-align:right;font-size:18px'><strong>Total " +
    formatINR(order.total) +
    "</strong></p><p style='color:#6f675d;font-size:13px'>Keep this email and order number for your records.</p>" +
    "</div></div>";

  return enqueueEmail(tx, {
    idempotencyKey: `order-status/${order.id}/${status}`,
    template: "ORDER_STATUS",
    recipientEmail: order.contactEmail,
    subject,
    html,
    referenceType: "Order",
    referenceId: order.id,
  });
}
