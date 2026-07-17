import type { AdminNotificationType } from "@prisma/client";
import { env } from "../../config/env.js";
import { enqueueEmail, type EmailOutboxTx } from "./emailOutbox.service.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    amount / 100,
  );
}

export async function queueAdminOrderNotificationEmail(
  tx: EmailOutboxTx,
  orderId: string,
  type: AdminNotificationType,
) {
  if (!env.ADMIN_NOTIFICATION_EMAIL) return null;
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      total: true,
      currency: true,
      contactEmail: true,
      paymentMethod: true,
      addressSnapshot: true,
      _count: { select: { items: true } },
    },
  });
  if (!order) return null;
  const address = order.addressSnapshot as {
    fullName?: string;
    city?: string;
    pincode?: string;
  };
  const isCod = type === "ORDER_COD_PLACED";
  const subject =
    (isCod ? "New COD order " : "Payment confirmed ") +
    "#" +
    order.id.slice(-8).toUpperCase();
  const orderUrl = env.FRONTEND_URL.replace(/\/$/, "") + "/admin/orders/" + order.id;
  const html =
    "<div style='font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f1b14'>" +
    "<div style='background:#171714;color:white;padding:18px 24px;font-weight:700'>beFitBeStrong Admin</div>" +
    "<div style='padding:24px;border:1px solid #e5e0d7'>" +
    "<p style='font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#6f675d'>" +
    (isCod ? "Cash on delivery" : "Prepaid order") +
    "</p><h1 style='font-size:24px;margin:8px 0 18px'>" +
    escapeHtml(subject) +
    "</h1><p><strong>" +
    formatAmount(order.total, order.currency) +
    "</strong> · " +
    order._count.items +
    " item(s)</p><p>Customer: " +
    escapeHtml(address.fullName ?? order.contactEmail) +
    "<br>Email: " +
    escapeHtml(order.contactEmail) +
    "<br>Delivery: " +
    escapeHtml([address.city, address.pincode].filter(Boolean).join(" ")) +
    "</p><p style='margin-top:24px'><a href='" +
    escapeHtml(orderUrl) +
    "' style='display:inline-block;background:#f5b800;color:#171714;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700'>Open order</a></p>" +
    "<p style='margin-top:20px;color:#6f675d;font-size:12px'>This email is a secondary alert. The admin notification center remains the source of truth.</p>" +
    "</div></div>";

  return enqueueEmail(tx, {
    idempotencyKey: `admin-order/${type}/${order.id}`,
    template: "ADMIN_ORDER_ALERT",
    recipientEmail: env.ADMIN_NOTIFICATION_EMAIL,
    subject,
    html,
    referenceType: "Order",
    referenceId: order.id,
  });
}
