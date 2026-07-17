import type { EmailOutboxTx } from "../notifications/emailOutbox.service.js";
import { enqueueEmail } from "../notifications/emailOutbox.service.js";
import { env } from "../../config/env.js";
import { shouldSendBackInStock } from "./stockAlertPolicy.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function queueBackInStockNotifications(
  tx: EmailOutboxTx,
  variantId: string,
  previousStock: number,
  nextStock: number,
) {
  if (!shouldSendBackInStock(previousStock, nextStock)) {
    return { attempted: 0, queued: 0 };
  }
  const alerts = await tx.stockAlert.findMany({
    where: { variantId, active: true },
    include: {
      user: { select: { email: true } },
      variant: {
        include: { product: { select: { name: true, slug: true } } },
      },
    },
  });
  for (const alert of alerts) {
    const product = alert.variant.product;
    const variantLabel =
      [alert.variant.size, alert.variant.color].filter(Boolean).join(" / ") ||
      alert.variant.sku;
    const productUrl =
      env.FRONTEND_URL.replace(/\/$/, "") + "/shop/" + product.slug;
    const subject = product.name + " is back in stock";
    const html =
      "<div style='font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f1b14'>" +
      "<div style='background:#f5b800;padding:18px 24px;font-weight:700'>beFitBeStrong</div>" +
      "<div style='padding:24px;border:1px solid #e5e0d7'>" +
      "<h1 style='font-size:24px;margin:0 0 12px'>" +
      escapeHtml(product.name) +
      " is available again</h1><p>The " +
      escapeHtml(variantLabel) +
      " variant you asked about is back in stock.</p>" +
      "<p><a href='" +
      escapeHtml(productUrl) +
      "' style='display:inline-block;background:#1f1b14;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px'>Shop now</a></p>" +
      "<p style='color:#6f675d;font-size:13px'>Stock is not reserved and may sell out again.</p>" +
      "</div></div>";
    const version = alert.updatedAt.toISOString();
    await enqueueEmail(tx, {
      idempotencyKey: `stock-alert/${alert.id}/${alert.updatedAt.getTime()}`,
      template: "BACK_IN_STOCK",
      recipientEmail: alert.user.email,
      subject,
      html,
      referenceType: "StockAlert",
      referenceId: alert.id,
      referenceVersion: version,
    });
  }
  return { attempted: alerts.length, queued: alerts.length };
}
