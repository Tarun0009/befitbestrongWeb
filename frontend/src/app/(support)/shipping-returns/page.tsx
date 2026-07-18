import type { Metadata } from "next";
import { SupportPage } from "@/features/support/SupportPage";

export const metadata: Metadata = {
  title: "Shipping and returns",
  description: "How delivery checks, cancellations, returns, and refunds work.",
  alternates: { canonical: "/shipping-returns" },
};

export default function ShippingReturnsPage() {
  return (
    <SupportPage
      eyebrow="Policies"
      title="Shipping and returns"
      description="The checkout page is the source of truth for delivery availability, estimated dates, payment options, and fees for your PIN code."
      updated="18 July 2026"
      sections={[
        {
          title: "Delivery coverage",
          paragraphs: [
            "We currently serve a limited set of areas. Enter your six-digit PIN code before checkout. If the PIN code is not serviceable, you can submit an area request so the team can measure demand; an area request is not a delivery promise.",
          ],
        },
        {
          title: "Dispatch and delivery estimates",
          paragraphs: [
            "Any dispatch or delivery estimate shown for an order is an estimate, not a guaranteed time. Carrier availability, address validation, weather, and other operational events can change the actual date. Track the latest order status from your account.",
          ],
        },
        {
          title: "Cancellation",
          paragraphs: [
            "Cancellation is available only when the order page offers the cancellation action. Once an order has progressed to fulfillment, cancellation may no longer be possible. If a cancellation is accepted, the refund path depends on the payment method and provider confirmation.",
          ],
        },
        {
          title: "Returns and refunds",
          paragraphs: [
            "Return eligibility, condition requirements, and timelines must be confirmed by the store operator and shown to customers before launch. Do not send an item back without an approved return instruction. Approved refunds are recorded against the order and may take additional time to appear through the original payment method.",
          ],
        },
        {
          title: "Damaged, incorrect, or missing items",
          paragraphs: [
            "Keep the packaging and delivery evidence, then report the issue with the order number and clear photos through the configured support channel. Resolution depends on verification and available stock.",
          ],
        },
      ]}
    />
  );
}

