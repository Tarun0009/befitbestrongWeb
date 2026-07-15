import type { AdminNotificationType } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../config/db.js";
import { logger } from "../../config/logger.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(amount / 100);
}

export async function sendAdminOrderNotificationEmail(
  orderId: string,
  type: AdminNotificationType,
) {
  if (
    !env.RESEND_API_KEY ||
    !env.EMAIL_FROM ||
    !env.ADMIN_NOTIFICATION_EMAIL
  ) {
    logger.debug(
      { orderId, type },
      "admin order email skipped: admin notification email is not configured",
    );
    return;
  }

  const order = await prisma.order.findUnique({
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
  if (!order) return;

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
  const orderUrl =
    env.FRONTEND_URL.replace(/\/$/, "") + "/admin/orders/" + order.id;

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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [env.ADMIN_NOTIFICATION_EMAIL],
      subject,
      html,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      "Admin notification email failed with " +
        response.status +
        ": " +
        body.slice(0, 300),
    );
  }

  logger.info(
    { orderId, type, to: env.ADMIN_NOTIFICATION_EMAIL },
    "admin order email sent",
  );
}

