import type { Metadata } from "next";
import { SupportPage } from "@/features/support/SupportPage";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "Terms for using the beFitBeStrong storefront and account services.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <SupportPage
      eyebrow="Legal"
      title="Terms of service"
      description="These draft terms describe the basic rules for using the storefront. The store operator must replace this draft with approved terms, business details, and jurisdiction-specific language before accepting real orders."
      updated="18 July 2026"
      sections={[
        {
          title: "Using the service",
          paragraphs: [
            "You agree to provide accurate account and delivery information, keep your credentials secure, and use the storefront lawfully. We may limit access when necessary to protect customers, the service, or payment and delivery operations.",
          ],
        },
        {
          title: "Products, prices, and availability",
          paragraphs: [
            "Product details, prices, inventory, delivery coverage, and payment options can change. An order is accepted only after the platform confirms it. If a material issue prevents fulfillment, the store operator will follow the published cancellation and refund process.",
          ],
        },
        {
          title: "Payments and orders",
          paragraphs: [
            "Online payments are processed by the configured payment provider. Cash on delivery, where enabled, is limited by PIN code, order value, stock, and risk rules shown during checkout. Do not treat a payment-provider screen alone as confirmation until the order status is updated.",
          ],
        },
        {
          title: "Content and acceptable use",
          paragraphs: [
            "Do not misuse the storefront, attempt unauthorized access, submit harmful content, or interfere with checkout, inventory, delivery, or notification systems.",
          ],
        },
        {
          title: "Policy and contact details",
          paragraphs: [
            "The final terms must include the legal business name, registered address, governing law, grievance process, and a monitored support contact before launch. This page is a product draft and is not legal advice.",
          ],
        },
      ]}
    />
  );
}

