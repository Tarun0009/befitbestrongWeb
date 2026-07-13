import { env } from "../../config/env.js";
import { prisma } from "../../config/db.js";
import { logger } from "../../config/logger.js";
import { shouldSendBackInStock } from "./stockAlertPolicy.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendBackInStockNotifications(
  variantId: string,
  previousStock: number,
  nextStock: number,
) {
  if (!shouldSendBackInStock(previousStock, nextStock)) {
    return { configured: true, attempted: 0, sent: 0 };
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.debug(
      { variantId, previousStock, nextStock },
      "back-in-stock email skipped: Resend is not configured",
    );
    return { configured: false, attempted: 0, sent: 0 };
  }

  const alerts = await prisma.stockAlert.findMany({
    where: { variantId, active: true },
    include: {
      user: { select: { email: true, name: true } },
      variant: {
        include: {
          product: {
            select: { name: true, slug: true },
          },
        },
      },
    },
  });

  const sentIds: string[] = [];
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

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [alert.user.email],
          subject,
          html,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          "Resend email failed with " +
            response.status +
            ": " +
            body.slice(0, 300),
        );
      }
      sentIds.push(alert.id);
    } catch (error) {
      logger.error(
        { error, alertId: alert.id, variantId },
        "back-in-stock email failed",
      );
    }
  }

  if (sentIds.length > 0) {
    await prisma.stockAlert.updateMany({
      where: { id: { in: sentIds } },
      data: { active: false, notifiedAt: new Date() },
    });
  }

  logger.info(
    {
      variantId,
      attempted: alerts.length,
      sent: sentIds.length,
    },
    "back-in-stock notification run completed",
  );

  return {
    configured: true,
    attempted: alerts.length,
    sent: sentIds.length,
  };
}
