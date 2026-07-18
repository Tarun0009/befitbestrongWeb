import type { Metadata } from "next";
import { SupportPage } from "@/features/support/SupportPage";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How beFitBeStrong handles account, order, and service data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <SupportPage
      eyebrow="Legal"
      title="Privacy policy"
      description="This draft describes the categories of information the platform uses to provide accounts, shopping, checkout, delivery, and support. The store operator should have local counsel review and publish the final policy before launch."
      updated="18 July 2026"
      sections={[
        {
          title: "Information we use",
          bullets: [
            "Account details such as name, email, authentication identifiers, and profile information.",
            "Order, address, payment-status, delivery, wishlist, rewards, and subscription records needed to provide the service.",
            "PIN-code checks and area requests used to determine coverage and plan future service areas.",
            "Technical, security, and diagnostic information needed to keep the platform reliable and prevent abuse.",
          ],
        },
        {
          title: "Service providers",
          paragraphs: [
            "The platform may use Firebase Authentication, Razorpay, delivery partners, email providers, hosting, database, and monitoring services. Each integration should be configured with the minimum data required and reviewed by the store operator before production use.",
          ],
        },
        {
          title: "Your choices",
          paragraphs: [
            "You can manage account data from your account where those controls are available. You can also request access, correction, or deletion through the verified support contact configured by the store operator. Transactional messages may still be sent when required to complete or secure an order.",
          ],
        },
        {
          title: "Retention and security",
          paragraphs: [
            "Records are retained only for operational, legal, fraud-prevention, and reconciliation needs. Access controls, audit logs, rate limits, backups, and provider security settings are part of the production launch checklist; they do not replace a formal legal review.",
          ],
        },
      ]}
    />
  );
}

