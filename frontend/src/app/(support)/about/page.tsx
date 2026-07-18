import type { Metadata } from "next";
import { SupportPage } from "@/features/support/SupportPage";

export const metadata: Metadata = {
  title: "About us",
  description: "Learn what beFitBeStrong is building for everyday training.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <SupportPage
      eyebrow="About beFitBeStrong"
      title="Built for the next session"
      description="beFitBeStrong is a fitness commerce platform for supplements, home-gym equipment, training apparel, and useful accessories. We focus on clear product information and a checkout experience that tells you what is available for your delivery PIN code."
      sections={[
        {
          title: "What we value",
          bullets: [
            "Product details that help you compare before you buy.",
            "Straightforward prices, stock status, and delivery checks.",
            "Customer accounts that keep orders, cancellations, and saved items together.",
          ],
        },
        {
          title: "Our service area",
          paragraphs: [
            "Delivery coverage is limited and can change. Enter your six-digit PIN code on a product or at checkout to see whether the current service area includes you. If it does not, you can request that area for future planning.",
          ],
        },
      ]}
    />
  );
}

