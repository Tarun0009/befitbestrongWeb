import { enqueueEmail, type EmailOutboxTx } from "../notifications/emailOutbox.service.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function queueSubscriptionRenewalEmail(
  tx: EmailOutboxTx,
  input: {
    renewalId: string;
    to: string;
    productName: string;
    quantity: number;
    ready: boolean;
    discountedTotal: number;
  },
) {
  const total = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(input.discountedTotal / 100);
  const subject = input.ready
    ? "Your beFitBeStrong subscription is ready"
    : "Your subscription item needs attention";
  const productName = escapeHtml(input.productName);
  const status = input.ready
    ? `Your next ${productName} renewal is ready at ${total}. Sign in to review and check out.`
    : `${productName} is currently short on stock. We recorded the renewal without reserving inventory and will keep your schedule visible.`;
  const html =
    "<div style='font-family:Arial,sans-serif;max-width:600px;margin:auto'>" +
    "<h1>beFitBeStrong subscriptions</h1><p>" +
    status +
    "</p><p>Quantity: " +
    input.quantity +
    "</p></div>";
  return enqueueEmail(tx, {
    idempotencyKey: `subscription-renewal/${input.renewalId}`,
    template: "SUBSCRIPTION_RENEWAL",
    recipientEmail: input.to,
    subject,
    html,
    referenceType: "SubscriptionRenewal",
    referenceId: input.renewalId,
  });
}
