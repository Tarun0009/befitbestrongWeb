import type { Metadata } from "next";
import Link from "next/link";
import { SupportPage } from "@/features/support/SupportPage";

export const metadata: Metadata = {
  title: "Customer support",
  description: "Find answers about delivery checks, orders, payments, and returns.",
  alternates: { canonical: "/support" },
};

export default function SupportRoute() {
  return (
    <SupportPage
      eyebrow="Help centre"
      title="Customer support"
      description="The fastest way to get order-specific information is to sign in and open your order. The order page shows the current status and available actions for that order."
      sections={[
        {
          title: "Before placing an order",
          bullets: [
            "Check your six-digit PIN code on the product page or during checkout.",
            "Review the delivery estimate, payment options, and any applicable fee shown for your PIN code.",
            "Make sure your name, phone number, email, and address are correct before confirming checkout.",
          ],
        },
        {
          title: "After placing an order",
          paragraphs: [
            "Sign in and open Account → Orders to review the latest status. If you checked out as a guest, use the order link shown on the confirmation screen and keep the contact email used at checkout available.",
          ],
        },
        {
          title: "Need help with an order?",
          paragraphs: [
            "Keep your order number, the email or phone used at checkout, and a short description of the issue ready. A monitored support contact must be configured by the store operator before launch; this page does not display an unverified address.",
          ],
        },
        {
          title: "Common destinations",
          paragraphs: [
            "Read the shipping and returns policy for eligibility details, or review the privacy and terms pages to understand how the service handles account and order data.",
          ],
        },
      ]}
    >
      <Link href="/shipping-returns">Shipping and returns</Link>
    </SupportPage>
  );
}

