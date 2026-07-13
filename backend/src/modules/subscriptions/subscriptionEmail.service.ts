import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export async function sendSubscriptionRenewalEmail(input: {
  to: string;
  productName: string;
  quantity: number;
  ready: boolean;
  discountedTotal: number;
}): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.debug(
      { to: input.to, product: input.productName },
      "subscription reminder skipped: Resend is not configured",
    );
    return false;
  }

  const total = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(input.discountedTotal / 100);
  const subject = input.ready
    ? "Your beFitBeStrong subscription is ready"
    : "Your subscription item needs attention";
  const status = input.ready
    ? `Your next ${input.productName} renewal is ready at ${total}. Sign in to review and check out.`
    : `${input.productName} is currently short on stock. We recorded the renewal without reserving inventory and will keep your schedule visible.`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.to],
      subject,
      html:
        "<div style='font-family:Arial,sans-serif;max-width:600px;margin:auto'>" +
        "<h1>beFitBeStrong subscriptions</h1><p>" +
        status +
        "</p><p>Quantity: " +
        input.quantity +
        "</p></div>",
    }),
  });
  if (!response.ok) {
    throw new Error("Subscription reminder failed with " + response.status);
  }
  return true;
}